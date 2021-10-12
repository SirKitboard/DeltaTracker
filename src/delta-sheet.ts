import * as fs from 'fs';
import * as readline from 'readline';
import { google } from 'googleapis';
import { OutputRow } from './main';

const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

interface Account {
	platformID: string;
	platform: string;
	accountID: string;
}

interface Player {
	deltaID: string;
	name: string;
	accounts: Account[];
}

export default class DeltaSheet {
	private sheet: any;
	private trackingData: {[key: string]: Date | null};
	private SHEET_ID: string;

	constructor() {

		this.SHEET_ID = process.env.SHEET_ID;
	}

	public async init() {
		this.sheet = await this.getSheetsAPI();
		await this.populateLastTrackedData();
	}

	/**
	 * Get and store new token after prompting for user authorization, and then
	 * execute the given callback with the authorized OAuth2 client.
	 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
	 * @param {getEventsCallback} callback The callback for the authorized client.
	 */
	private async getNewToken(oAuth2Client) {
		return new Promise((resolve, reject) => {

			const authUrl = oAuth2Client.generateAuthUrl({
				access_type: 'offline',
				scope: SCOPES,
			});
			console.log('Authorize this app by visiting this url:', authUrl);
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			rl.question('Enter the code from that page here: ', (code) => {
				rl.close();
				oAuth2Client.getToken(code, (err, token) => {
					if (err) return console.error('Error retrieving access token', err);
					oAuth2Client.setCredentials(token);
					// Store the token to disk for later program executions
					fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
						if (err) reject(err);
						console.log('Token stored to', TOKEN_PATH);
					});
					resolve(oAuth2Client);
				});
			});
		})
	}
	

	private async getSheetsAPI() {
		const loginPromise = new Promise((resolve) => {
			const redirectURI = process.env.GOOGLE_OAUTH_REDIRECT_URIS.split(',')[0]
			const oAuth2Client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID,process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectURI);
			// Check if we have previously stored a token.
			fs.readFile(TOKEN_PATH, async (err, token) => {
				if (err) {
					return resolve(await this.getNewToken(oAuth2Client));
				}
				oAuth2Client.setCredentials(JSON.parse(token as any));
				resolve(oAuth2Client)
			});
		})

		const oAuth2Client = await loginPromise;
		const sheets = google.sheets({
			version: 'v4',
			auth: oAuth2Client as any
		});
		return sheets;
	}


	async getSheetData(range) {
		return new Promise<any>((resolve, reject) => {
			this.sheet.spreadsheets.values.get({
				spreadsheetId: this.SHEET_ID,
				range: range,
			}, (err, res) => {
				if (err) return reject('The API returned an error: ' + err);
				const rows = res.data.values;
				if (rows && rows.length) {
					resolve(rows)
				} else {
					resolve([])
				}
			});
		})
	}

	async getPlayers() {
		const rows = await this.getSheetData("Tracker Import!B3:W");
		const players: Player[] = rows.filter((row) => {
			return row[1] != undefined && row[1].length > 0;
		}).map((row) => {
			const player: Player = {
				deltaID: row[0],
				name: row[1],
				accounts: []
			}
			for(let i = 3; i < row.length; i=i+2) {
				const urlFragments = row[i].split('/');
				let indexOfPlatformInFragements = 5;
				if(urlFragments[3] === 'profile') {
					indexOfPlatformInFragements = 4;
				}
				const accountID = row[i-1];
				player.accounts.push({
					platformID: urlFragments[indexOfPlatformInFragements + 1],
					platform: urlFragments[indexOfPlatformInFragements],
					accountID
				});
			}

			return player;
		});

		return players;
	}

	private async populateLastTrackedData() {
		this.trackingData = {};
		const data = await this.getSheetData("Daily Tracking!C3:E");
		for(const row of data) {
			if(row[1] in this.trackingData) {
				console.log(row);
				const date = new Date(row[2]);
				if(date > this.trackingData[row[0]]) {
					this.trackingData[row[0]] = date;
				}
			} else {
				this.trackingData[row[0]] = new Date(row[2]);
			}
		}
	}

	async getLastPullDateForLinkID(accountID: string): Promise<Date> {
		return this.trackingData[accountID];
	}

	async insertHistoryRows(rows: OutputRow[]) {
		const formattedRows = [];
		for(const row of rows) {
			formattedRows.push([
				row.accountID,
				row.playerID,
				row.dateTime,
				row.twosMMR,
				row.twosGamesPlayed,
				row.threesMMR,
				row.threesGamesPlayed
			])
		}

		const insertRow = (await this.getSheetData("Daily Tracking!C1:C")).length + 1;
		const insertRange = `Daily Tracking!C${insertRow}:I`;

		await this.sheet.spreadsheets.values.update({
			spreadsheetId: this.SHEET_ID,
			range: insertRange,
			valueInputOption: "USER_ENTERED",
			resource: {
				values: formattedRows
			}
		})
	}
}