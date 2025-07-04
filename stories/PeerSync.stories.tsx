import React, { useEffect, useRef, useState } from 'react';
import uuid from './src/utils/uuid.ts';
import PeerConn from './src/peer-conn.ts';
import PSync from './src/peer-sync.ts';

function PeerExample({ peers: peersProp, onId }) {
	const [conn, setConn] = useState(null!);
	const [sync, setSync] = useState(null!);
	const [peers, setPeers] = useState([]);
	const [checked, setChecked] = useState(false);
	const [assets, setAssets] = useState({});
	const [assetId] = useState(() => uuid());

	useEffect(() => {
		const pconn = new PeerConn({});
		setConn(pconn);

		const psync = new PSync(pconn);
		setSync(psync);

		pconn.on('connected', () => {
			onId?.(pconn.id);
		});
		pconn.on('peers', setPeers);

		return () => {
			pconn.destroy();
			psync.destroy();
		};
	}, []);

	useEffect(() => {
		if (!conn) return;
		conn.pids = peersProp;
	}, [conn, peersProp]);

	useEffect(() => {
		if (!sync) return;

		const handleAssets = (...args) => {
			console.log('handleassets', conn.id, args);
			setAssets(sync.assets);
		};
		sync.on('assetState', handleAssets);

		sync.createAsset(assetId, { checked: false });

		return () => {
			sync.off('assetState', handleAssets);
			sync.removeAssetById(assetId);
		};
	}, [conn, sync, assetId]);

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
								{Object.entries(sync?.getAssetsByOwner(pid) || {}).map((
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

export const Manual = () => {
	const [id, setId] = useState('');
	return (
		<div>
			<input value={id} onChange={({ target }) => setId(target.value)} />
			<PeerExample peers={[id]} />
		</div>
	);
};
