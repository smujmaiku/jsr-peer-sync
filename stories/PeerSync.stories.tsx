import React, { useEffect, useRef, useState } from 'react';
import uuidSmall from './src/uuid.ts';
import PSync from './src/peer-conn.ts';

function PeerExample({ peers: peersProp, onId }) {
	const [conn, setConn] = useState(null!);
	const [peers, setPeers] = useState([]);

	useEffect(() => {
		const psync = new PSync({});
		setConn(psync);

		return () => {
			psync.destroy();
		};
	}, []);

	useEffect(() => {
		if (!conn) return;
		conn.pids = peersProp;
	}, [conn, peersProp]);

	useEffect(() => {
		if (!conn) return;
		conn.on('connected', () => {
			onId(conn.id);
		});
		conn.on('peerData', console.log);
		conn.on('peers', setPeers);
	}, [conn]);

	useEffect(() => {
		if (!conn) return;
		conn.sendAll('hallo');
	}, [peers]);

	return (
		<div style={{ border: '1px solid pink' }}>
			<ul>
				<li>id: {conn?.id}</li>
				<li>
					peers:<ul>
						{peersProp.map((pid) => (
							<li>{pid} {peers.includes(pid) && '(connected)'}</li>
						))}
					</ul>
				</li>
			</ul>
		</div>
	);
}

export default {
	title: 'Example/PeerSync',
	component: () => {
		const [aId, setAId] = useState(undefined);
		const [bId, setBId] = useState(undefined);
		const [cId, setCId] = useState(undefined);

		return (
			<div>
				<PeerExample peers={[bId, cId]} onId={setAId} />
				<PeerExample peers={[aId, cId]} onId={setBId} />
				<PeerExample peers={[aId, bId]} onId={setCId} />
			</div>
		);
	},
};

export const PeerSync = {};
