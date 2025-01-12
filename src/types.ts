import { TypedEmitter } from 'tiny-typed-emitter';

// eventemitter3 doesn't cooperate with Deno so well
declare module 'peerjs' {
	type ErrorType = string;
	type RTCIceConnectionState = unknown;

	interface Peer extends
		TypedEmitter<{
			open: (id: string) => void;
			connection: (dataConnection: DataConnection) => void;
			call: (mediaConnection: MediaConnection) => void;
			close: () => void;
			disconnected: (currentId: string) => void;
			error: (error: PeerError<`${PeerErrorType}`>) => void;
		}> {}
	interface DataConnection extends
		TypedEmitter<{
			data: (data: unknown) => void;
			open: () => void;
			close: () => void;
			error: (error: PeerError<`${ErrorType}`>) => void;
			iceStateChanged: (state: RTCIceConnectionState) => void;
		}> {}
}

// immer likes to extends from this
export type AnyObject = {
	[key: string]: any;
};
