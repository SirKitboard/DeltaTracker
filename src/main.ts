import * as dotenv from 'dotenv';
import DeltaSheet from './delta-sheet';
import Tracker, { Playlists } from './tracker';
import { exit } from 'process';

dotenv.config();

const ROCKET_LEAGUE_LAUNCH_DATE = "2015/07/07";

export interface OutputRow {
	playerID: string;
	accountID: string;
	playerName: string;
	dateTime: string;
	twosMMR: number;
	twosGamesPlayed: number;
	threesMMR: number;
	threesGamesPlayed: number;
}

async function sync() {
	const deltaSheet = new DeltaSheet();
	await deltaSheet.init();
	let players = await deltaSheet.getPlayers();
	console.info("Number of players: ", players.length);

	// const pullDate = await deltaSheet.getLastPullDate();
	// console.info("Last pull date", pullDate);

	// pullDate.setDate(pullDate.getDate() + 1);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let totalRows = 0;
	const errorPlayers = [];
	let outputRows: OutputRow[] = [];
	for(let [i, player] of players.entries()) {
		console.log(`Stating Sync for: ${player.deltaID} ${i+1}/${players.length}`)
		let rowTemplate: Partial<OutputRow> = {
			playerID: player.deltaID,
			playerName: player.name,
			twosMMR: 0,
			threesMMR: 0,
			twosGamesPlayed: 0,
			threesGamesPlayed: 0
		};

		let rows: OutputRow[] = [];

		for(let account of player.accounts) {
			if(account.accountID === 'Loading...') {
				throw new Error('Error loading sheet');
			};
			try {
				let on = await deltaSheet.getLastPullDateForLinkID(account.accountID);
				if(!on) {
					on = new Date(ROCKET_LEAGUE_LAUNCH_DATE);
				}
				while(on < today) {
					console.log(`\t\tFetching data for ${on.toLocaleDateString()}`)
					on.setDate(on.getDate() + 1);
					const twosMMR = await Tracker.getPlayerMMR(account.platformID, account.platform, Playlists.RANKED_TWOS, on);
					const twosGamesPlayed = await Tracker.getPlayerNumGamesPlayed(account.platformID, account.platform, Playlists.RANKED_TWOS);
					const threesMMR = await Tracker.getPlayerMMR(account.platformID, account.platform, Playlists.RANKED_THREES, on);
					const threesGamesPlayed = await Tracker.getPlayerNumGamesPlayed(account.platformID, account.platform, Playlists.RANKED_THREES);
					if(twosMMR === null && threesMMR === null) {
						continue;
					}
					rows.push({
						...rowTemplate,
						twosGamesPlayed,
						twosMMR,
						threesGamesPlayed,
						threesMMR,
						accountID: account.accountID,
						dateTime: on.toLocaleDateString()
					} as OutputRow)
				}
			} catch(e) {
				// Player error, skipping
				console.log(`Errored Account ID: ${account.accountID}`)
				errorPlayers.push(account.accountID)
			}
		}
		outputRows.push(...rows);

		if(i % 20 === 0) {
			await deltaSheet.insertHistoryRows(outputRows);
			console.log("Wrote rows:", outputRows.length)
			totalRows+=outputRows.length;
			outputRows = [];
		}
	};
	await deltaSheet.insertHistoryRows(outputRows);
	totalRows+=outputRows.length;
	console.log("Total rows", totalRows)
	console.log("Errors", errorPlayers)
	exit();
}

(async () => {

	let success = false;

	do {
		try {
			await sync();
			success = true;
		} catch(e) {
			console.log(e)
		}
	} while(!success)
})();
