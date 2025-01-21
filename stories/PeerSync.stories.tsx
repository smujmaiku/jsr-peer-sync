import React, { useEffect, useRef, useState } from 'react';
import uuid from './src/uuid.ts';
import PSync from './src/peer-sync.ts';

function PeerExample({ peers: peersProp, onId }) {
	const [conn, setConn] = useState(null!);
	const [peers, setPeers] = useState([]);
	const [checked, setChecked] = useState(false);
	const [assets, setAssets] = useState({});
	const [assetId] = useState(() => uuid());

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

		conn.on('peers', setPeers);
	}, [conn]);

	useEffect(() => {
		if (!conn) return;

		const handleAssets = (...args) => {
			console.log('handleassets', conn.id, args);
			setAssets(conn.assets);
		};
		conn.on('assetState', handleAssets);

		conn.createAsset(assetId, { checked: false });

		return () => {
			conn.off('assetState', handleAssets);
			conn.removeAssetById(assetId);
		};
	}, [conn, assetId]);

	useEffect(() => {
		const asset = assets[assetId];
		if (!asset) return;
		asset.checked = checked;
	}, [assetId, checked]);

	return (
		<div style={{ border: '1px solid pink' }}>
			<ul>
				<li>id: {conn?.id}</li>
				<li>
					<input
						type='checkbox'
						checked={checked}
						onChange={({ target }) => setChecked(target.checked)}
					/>
					{assetId}
				</li>
				{peersProp.map((pid) => (
					<li key={pid}>
						peer: {pid || 'unknown'}
						{peers.includes(pid) && '(connected)'}
						{pid && (
							<ul>
								{Object.entries(conn?.getAssetsByOwner(pid) || {}).map((
									[aid, asset],
								) => (
									<li key={aid}>
										<input type='checkbox' checked={asset?.checked} disabled />
										{aid}
									</li>
								))}
							</ul>
						)}
					</li>
				))}
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
