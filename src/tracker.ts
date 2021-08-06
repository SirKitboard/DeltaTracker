import * as puppeteer from "puppeteer"
const axios = require('axios');

interface PlayerProfileSegmnet {
	type: string,
	attributes: {
		playlistId: number;
		season: number;
	},
	stats: {
		matchesPlayed: {
			value: number;
		}
	}
}

interface PlayerProfileResponse {
	data: {
		metadata: {
			playerId: number;
		},
		segments: PlayerProfileSegmnet[]
	}
}

export enum Playlists {
	RANKED_TWOS='11',
	RANKED_THREES='13'
}

interface MMRHistoryEntry {
	rating: number;
	collectDate: string;
}

type FormattedMMRHistoryEntry = {[key: string]: number}

interface PlayerMMRHistoryResponse {
	data: {
		[Playlists.RANKED_TWOS]: MMRHistoryEntry[]
		[Playlists.RANKED_THREES]: MMRHistoryEntry[]
	}
}

interface FormattedPlayerMMRHistory {
	[Playlists.RANKED_TWOS]: FormattedMMRHistoryEntry
	[Playlists.RANKED_THREES]: FormattedMMRHistoryEntry
}

export default class Tracker {
	static playerProfileResponseMap: {[key: string]: PlayerProfileResponse} = {}
	static playerMMRHistoryResponseMap: {[key: string]: FormattedPlayerMMRHistory} = {}
	private static browser: puppeteer.Browser;

	private static async initBrowser() {
		this.browser = await puppeteer.launch();
	}

	private static async fetchPuppeteer(url: string): Promise<PlayerProfileResponse | PlayerMMRHistoryResponse> {
		if (!this.browser) {
			await this.initBrowser();
		}
		const page = await this.browser.newPage();
		await page.goto(url);
		await page.waitForSelector('pre');
		const pre = await page.$('pre');
		const json = JSON.parse(await pre.evaluate(el => el.textContent));
		return json as PlayerProfileResponse;
	}

	private static fetchAxios = async (url: string): Promise<PlayerProfileResponse | PlayerMMRHistoryResponse> => {
		const response = await axios.get(url);
		return response.data;
	}

	private static async getPlayerProfile(platformID: string, platform: string): Promise<PlayerProfileResponse> {
		if(`${platformID}${platform}` in this.playerProfileResponseMap) {
			return this.playerProfileResponseMap[`${platformID}${platform}`];
		}
		let player: PlayerProfileResponse;
		const url = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${platformID}?`;
		try {
			player = await this.fetchAxios(url) as PlayerProfileResponse;
		} catch(e) {
			player = await this.fetchPuppeteer(url) as PlayerProfileResponse;
		}

		this.playerProfileResponseMap[`${platformID}${platform}`] = player;

		return player;
	}

	private static async getPlayerProfileID(platformID: string, platform: string): Promise<number> {
		let player = await this.getPlayerProfile(platformID, platform);
		const playerID = player.data.metadata.playerId;
		return playerID;
	}

	private static async getPlayerMMRHistory(platformID: string, platform: string): Promise<FormattedPlayerMMRHistory> {
		if (`${platformID}${platform}` in this.playerMMRHistoryResponseMap) {
			return this.playerMMRHistoryResponseMap[`${platformID}${platform}`];
		}

		let playerID = await this.getPlayerProfileID(platformID, platform); 
		let url = `https://api.tracker.gg/api/v1/rocket-league/player-history/mmr/${playerID}`;
		let playerMMRHistory: PlayerMMRHistoryResponse;
		try {
			playerMMRHistory = await this.fetchAxios(url) as PlayerMMRHistoryResponse;
		} catch(e) {
			playerMMRHistory = await this.fetchPuppeteer(url) as PlayerMMRHistoryResponse;
		}
		const formattedPlayerMMRHistory: FormattedPlayerMMRHistory = {
			[Playlists.RANKED_TWOS]: {},
			[Playlists.RANKED_THREES]: {},
		}
		const playlists = [Playlists.RANKED_TWOS, Playlists.RANKED_THREES];
		for(let playlist of playlists) {
			for(let sample of playerMMRHistory.data[playlist]) {
				formattedPlayerMMRHistory[playlist][sample.collectDate] = sample.rating;
			}
		}
		this.playerMMRHistoryResponseMap[`${platformID}${platform}`] = formattedPlayerMMRHistory;
		return formattedPlayerMMRHistory;
	}

	private static getDateString(on: Date) {
		return `${on.getFullYear()}-${(on.getMonth() + 1).toString().padStart(2, '0')}-${on.getDate()}T00:00:00+00:00`
	}

	public static async getPlayerMMR(platformID: string, platform: string, playlist: Playlists, on: Date): Promise<number> {
		const history = await this.getPlayerMMRHistory(platformID, platform)
		on.setHours(0, 0, 0);
		let dateString = this.getDateString(on);
		if(history[playlist][dateString]) {
			return history[playlist][dateString];
		} 
		return null;
	}

	public static async getPlayerNumGamesPlayed(platformID: string, platform: string, playlist: Playlists): Promise<number> {
		let player = await this.getPlayerProfile(platformID, platform);

		for (let segment of player.data.segments) {
			if(segment.type === 'playlist' && segment.attributes.playlistId as any == playlist) {
				return segment.stats.matchesPlayed.value;
			}
		}

		return 0;
	}

}