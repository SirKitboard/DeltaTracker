// import puppeteer from 'puppeteer';
// import * as readline from 'readline';
import * as dotenv from 'dotenv';
import DeltaSheet from './delta-sheet';
import Tracker, { Playlists } from './tracker';
import * as cliProgress from 'cli-progress';

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

(async () => {
	const deltaSheet = new DeltaSheet();
	await deltaSheet.init();
	let players = await deltaSheet.getPlayers();
	console.info("Number of players: ", players.length);

	// const pullDate = await deltaSheet.getLastPullDate();
	// console.info("Last pull date", pullDate);

	// pullDate.setDate(pullDate.getDate() + 1);
	const today = new Date();
	
	let outputRows: OutputRow[] = [];
	let pb: cliProgress.SingleBar | null = null;
	pb = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);
	pb.start(players.length, 0, {
		speed: "N/A"
	});
	for(let [i, player] of players.entries()) {
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
			try {
				let on = await deltaSheet.getLastPullDateForLinkID(account.accountID);
				if(!on) {
					on = new Date(ROCKET_LEAGUE_LAUNCH_DATE);
				}
				while(on < today) {
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
			}
		}
		outputRows.push(...rows);
		pb?.increment();

		if(i % 20 === 0) {
			await deltaSheet.insertHistoryRows(outputRows);
			outputRows = [];
		}
	};

	pb?.stop();
})();