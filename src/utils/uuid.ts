let time = 0;
let index = 0;

const TIME_PAD = 7;
const INDEX_PAD = 5;

/** Create the smaller uuid */
function createUuid(time: number, index: number): string {
	return [
		time.toString(36).padStart(TIME_PAD, '0'),
		index.toString(36).padStart(INDEX_PAD, '0'),
	].join('');
}

/**
 * Create a smaller uuid that is sortable
 * Concept from firebase key generator
 */
export function uuid(): string {
	const now = Math.floor(Date.now() / 1000);
	if (now !== time) {
		time = now;
		index = Math.floor(Math.random() * 36 ** (INDEX_PAD - 1));
	} else {
		index += 1;
	}

	return createUuid(time, index);
}

export default uuid;
