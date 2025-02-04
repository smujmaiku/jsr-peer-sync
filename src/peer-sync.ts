// @ts-types="@types/memoizee"
import memoizee, { type Memoized } from 'memoizee';
import type { AnyObject } from './types.ts';
import {
	type BatchedEventCallbackFn,
	createDeepObserverBatched,
	removeDeepObserverBatched,
} from '@smujdev/deep-observer';
import { PeerConn, type PeerConnOptionsI } from './peer-conn.ts';

function clearMemoizee<T extends Function | Memoized<T>>(fn: T): void {
	if (!('clear' in fn)) return;
	fn.clear();
}

interface NetEventsI<S extends AnyObject> {
	HELO: undefined;
	GETASSET: { id: string };
	ASSETLIST: { assets: string[] };
	ASSETSTATE: { id: string; state: S };
}

const netEventType: (keyof NetEventsI<never>)[] = [
	'HELO',
	'GETASSET',
	'ASSETLIST',
	'ASSETSTATE',
];

type NetEventT<S extends AnyObject> = {
	[K in keyof NetEventsI<S>]: [K, NetEventsI<S>[K]];
}[keyof NetEventsI<S>];

export interface PeerSyncEvents<PD = unknown> {
	assetState: (id: string, state: PD) => void;
}

function parseEvent<S extends AnyObject>(data: unknown): NetEventT<S> | [] {
	if (!(data instanceof Array)) return [];

	const [type, payload] = data;
	if (!netEventType.includes(type)) return [];

	return [type, payload];
}

export class PeerSync<S extends AnyObject>
	extends PeerConn<NetEventT<S>, PeerSyncEvents<S>> {
	private $assets: Record<
		string,
		{ state?: S; asset?: S; owner?: string; callback: BatchedEventCallbackFn }
	> = {};

	getAssets(): Record<string, S> {
		const { $assets } = this;
		const assets: Record<string, S> = {};

		for (const [id, { asset }] of Object.entries($assets)) {
			if (!asset) continue;
			assets[id] = asset;
		}

		return assets;
	}

	get assets(): Record<string, S> {
		return this.getAssets();
	}

	getAssetsByOwner(pid?: string): Record<string, S> {
		const { $assets } = this;
		const assets: Record<string, S> = {};

		for (const [id, { asset, owner }] of Object.entries($assets)) {
			if (!asset) continue;
			if (owner !== pid) continue;
			assets[id] = asset;
		}
		return assets;
	}

	constructor(options: PeerConnOptionsI) {
		super(options);

		this.on('peers', this.handlePeers.bind(this));
		this.on('peerOpen', this.handlePeerOpen.bind(this));
		this.on('peerData', this.handlePeerData.bind(this));

		this.getAssets = memoizee(this.getAssets.bind(this));
		this.getAssetsByOwner = memoizee(this.getAssetsByOwner.bind(this));
	}

	private emitAssetState(id: string, state: S) {
		clearMemoizee(this.getAssets);
		clearMemoizee(this.getAssetsByOwner);

		this.emit('assetState', id, state);
	}

	private handleAssetChange(
		id: string,
		state: S,
		owner: string | undefined,
		_props: Parameters<BatchedEventCallbackFn>[0],
	) {
		if (owner) {
			this.emitAssetState(id, state);
		} else {
			clearMemoizee(this.getAssets);
			clearMemoizee(this.getAssetsByOwner);

			this.sendAll(['ASSETSTATE', { id, state }]);
		}
	}

	createAsset(id: string, state: S): S {
		return this.$createAsset(id, state, undefined);
	}

	private $reserveAsset(id: string, owner: string | undefined): void {
		this.removeAssetById(id);

		this.$assets[id] = {
			owner,
			callback: () => {},
		};
	}

	private $createAsset(id: string, state: S, owner: string | undefined): S {
		this.$reserveAsset(id, owner);

		const callback = this.handleAssetChange.bind(this, id, state, owner);

		const asset = createDeepObserverBatched(state, callback, 1);
		this.$assets[id] = {
			state,
			asset,
			owner,
			callback,
		};

		this.emitAssetState(id, state);

		return asset;
	}

	removeAssetById(id: string) {
		const instance = this.$assets[id];
		if (!instance) return;

		const { asset, callback } = instance;

		if (asset && callback) {
			removeDeepObserverBatched(asset, callback);
		}

		delete this.$assets[id];
	}

	private handlePeers(pids: string[]) {
		this.cleanAssets();
	}

	private handlePeerOpen(pid: string) {
		this.send(pid, ['HELO', undefined]);
	}

	private handlePeerData(pid: string, event: NetEventT<S>) {
		const [type, payload] = parseEvent<S>(event);

		switch (type) {
			case 'HELO': {
				this.sendAssetList(pid);
				break;
			}
			case 'GETASSET': {
				const { id } = payload;
				this.sendAsset(pid, id);
				break;
			}
			case 'ASSETLIST': {
				const { assets } = payload;

				this.cleanAssets();

				for (const id of assets) {
					this.$reserveAsset(id, pid);
					this.send(pid, ['GETASSET', { id }]);
				}
				break;
			}
			case 'ASSETSTATE': {
				const { id, state } = payload;
				const { asset, owner } = this.$assets[id] || {};

				if (owner !== pid) {
					this.send(pid, ['HELO', undefined]);
					break;
				}

				if (!asset) {
					this.$createAsset(id, state, pid);
					break;
				}

				for (const [key, value] of Object.entries(state)) {
					Reflect.set(asset, key, value);
				}
				break;
			}
			default:
		}
	}

	cleanAssets() {
		const { peers, $assets } = this;

		for (const [id, { owner }] of Object.entries($assets)) {
			if (owner === undefined) continue;
			if (peers.includes(owner)) continue;
			this.removeAssetById(id);
		}
	}

	sendAssetList(pid: string) {
		const assets = Object.entries(this.$assets).filter(([, { owner, asset }]) =>
			asset && owner === undefined
		).map(([id]) => id);
		this.send(pid, ['ASSETLIST', {
			assets,
		}]);
	}

	sendAllAssetList() {
		const assets = Object.entries(this.$assets).filter(([, { owner, asset }]) =>
			asset && owner === undefined
		).map(([id]) => id);
		this.sendAll(['ASSETLIST', {
			assets,
		}]);
	}

	sendAsset(pid: string, id: string) {
		const { $assets } = this;
		const { state } = $assets[id];

		if (!state) return;

		this.send(pid, ['ASSETSTATE', {
			id,
			state,
		}]);
	}
}

export * from './peer-conn.ts';
export * from './peer-sync.ts';
export * from './types.ts';
export * from './uuid.ts';

export default PeerSync;
