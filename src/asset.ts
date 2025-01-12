import { TypedEmitter } from 'tiny-typed-emitter';
import { createDraft, current, Draft, finishDraft } from 'immer';
import { AnyObject } from './types.ts';
import uuidSmall from './uuid.ts';

export interface AssetStateEventI<S> {
	id: string;
	state: Partial<S>;
}

export interface AssetEventsI<S> {
	state: (state: AssetStateEventI<S>) => void;
	dispose: (id: string) => void;
}

export interface AssetOptionsI {
	id?: string;
	debounce?: number;
}

export class PeerAsset<S extends AnyObject> extends TypedEmitter<
	AssetEventsI<S>
> {
	private $id: string;

	private debounce: number;

	private baseState: S;

	private draftState: Draft<S>;

	private updateTimer?: number;

	constructor(state: S, options: AssetOptionsI) {
		super();
		const { id = uuidSmall(), debounce = 10 } = options || {};
		this.$id = id;
		this.debounce = debounce;
		this.draftState = createDraft({ ...state });
		this.baseState = current(this.draftState) as S;
	}

	get id() {
		return this.$id;
	}

	get state(): S {
		if (!this.updateTimer) {
			this.updateTimer = globalThis?.setTimeout?.(
				this.update.bind(this),
				this.debounce,
			);
		}

		return this.draftState as S;
	}

	set state(state: S) {
		this.patch(state);
	}

	patch(state: Partial<S>) {
		const { draftState } = this;
		for (const [key, value] of Object.entries(state)) {
			draftState[key as keyof Draft<S>] = value;
		}
	}

	update() {
		const { id, baseState: oldState, draftState } = this;

		// Clear timers
		globalThis?.clearTimeout?.(this.updateTimer);
		this.updateTimer = undefined;

		// Shuffle states
		const state = finishDraft(draftState) as S;
		this.draftState = createDraft(state);
		this.baseState = state;

		// Nothing changed
		if (oldState === state) return;

		// Diff states
		const patch: Partial<S> = {};
		for (const [key, value] of Object.entries(state)) {
			if (oldState[key] === value) continue;
			patch[key as keyof S] = value;
		}

		// Nothing changed
		if (Object.keys(patch).length < 1) return;

		// Emit
		this.emit('state', { id, state: patch });
	}

	dispose() {
		this.emit('dispose', this.id);
	}
}

export default PeerAsset;
