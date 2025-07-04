import React, { useEffect, useRef, useState } from 'react';
import uuid from './src/utils/uuid.ts';
import PeerConn from './src/borker.ts';
import PSync from './src/peer-sync.ts';
import Broker from './src/broker.ts';

const BROKER_ID = 'asdfkljasdlfk';

function BrokerHostExample({ name }) {
	const [id] = useState(BROKER_ID);
	const [conns, setConns] = useState<string[]>([]);

	useEffect(() => {
		const pbroker = new Broker(id);

		pbroker.on('connection', () => {
			setConns(pbroker.connIds);
		});

		return () => {
			pbroker.destroy();
		};
	}, []);

	return (
		<div style={{ border: '1px solid pink' }}>
			<ul>
				<li>id: {id}</li>
				{conns.map(({ id, name }) => (
					<li key={id}>
						peer: {id || 'unknown'} ({name})
					</li>
				))}
			</ul>
		</div>
	);
}

export default {
	title: 'Example/BrokerHostSync',
	component: () => {
		return (
			<div>
				<BrokerHostExample name='clientC' />
			</div>
		);
	},
};

export const BrokerHostSync = {};
