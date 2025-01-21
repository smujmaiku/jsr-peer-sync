import { AnyObject } from './types.ts';
import {
	BatchedEventCallbackFn,
	createDeepObserverBatched,
	removeDeepObserverBatched,
} from '@smujdev/deep-observer';
import PeerConn, { PeerConnOptionsI } from './peer-conn.ts';

interface NetEventsI<S extends any> {
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

type NetEventT<S> = {
	[K in keyof NetEventsI<S>]: [K, NetEventsI<S>[K]];
}[keyof NetEventsI<S>];

export interface PeerConnEvents<PD = unknown> {
	assetState: (id: string, state: PD) => void;
}

function parseEvent<S extends any>(data: unknown): NetEventT<S> | [] {
	if (!(data instanceof Array)) return [];

	const [type, payload] = data;
	if (!netEventType.includes(type)) return [];

	return [type, payload];
}

export class PeerSync<S extends AnyObject>
	extends PeerConn<NetEventT<S>, PeerConnEvents<S>> {
	private $assets: Record<
		string,
		{ state?: S; asset?: S; owner?: string; callback: BatchedEventCallbackFn }
	> = {};

	get assets(): Record<string, S> {
		const { $assets } = this;
		const assets: Record<string, S> = {};

		for (const [id, { asset }] of Object.entries($assets)) {
			if (!asset) continue;
			assets[id] = asset;
		}
		// TODO memo this until something changes
		return assets;
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

		const callback = owner
			? () => {
				this.emit('assetState', id, state);
			}
			: () => {
				this.sendAll(['ASSETSTATE', { id, state }]);
			};
		const asset = createDeepObserverBatched(state, callback, 1);
		this.$assets[id] = {
			state,
			asset,
			owner,
			callback,
		};

		this.emit('assetState', id, state);

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

export default PeerSync;
