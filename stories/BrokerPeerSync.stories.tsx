import React, { useEffect, useRef, useState } from 'react';
import uuid from './src/utils/uuid.ts';
import PeerConn from './src/peer-conn.ts';
import PSync from './src/peer-sync.ts';
import Broker from './src/middleware/brokered.ts';

const BROKER_ID = 'asdfkljasdlfk';

function BrokerPeerExample({ name }) {
	const [id, setId] = useState(undefined);
	const [conn, setConn] = useState(null!);
	const [sync, setSync] = useState(null!);
	const [broker, setBroker] = useState(null!);
	const [peers, setPeers] = useState([]);
	const [checked, setChecked] = useState(false);
	const [assets, setAssets] = useState({});
	const [assetId] = useState(() => uuid());

	useEffect(() => {
		const pconn = new PeerConn({});
		setConn(pconn);

		const psync = new PSync(pconn);
		setSync(psync);

		const pbroker = new Broker(pconn, {
			brokerId: BROKER_ID,
			payload: name,
		});
		setBroker(pbroker);

		pconn.on('connected', () => {
			setId(pconn.id);
		});
		pconn.on('peers', setPeers);

		return () => {
			pconn.destroy();
			pbroker.stop();
		};
	}, []);

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
	}, [sync, assetId]);

	useEffect(() => {
		const asset = assets[assetId];
		if (!asset) return;
		asset.checked = checked;
	}, [assetId, checked]);

	return (
		<div style={{ border: '1px solid pink' }}>
			<ul>
				<li>id: {id}</li>
				<li>
					<input
						type='checkbox'
						checked={checked}
						onChange={({ target }) => setChecked(target.checked)}
					/>
					{assetId}
				</li>
				{peers.map((pid) => (
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
	title: 'Example/BrokerPeerSync',
	component: () => {
		return (
			<div>
				<BrokerPeerExample name='clientA' />
				<BrokerPeerExample name='clientB' />
				<BrokerPeerExample name='clientC' />
			</div>
		);
	},
};

export const BrokerPeerSync = {};
