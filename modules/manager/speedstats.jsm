/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll SpeedStats module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ['SpeedStats'];

/**
 * Speed Statistics
 * @param maxSpeeds (unsigned) Maximum number of speeds to count
 */
function SpeedStats(maxSpeeds) {
	this._maxSpeeds = maxSpeeds;
	this.clear();
}

SpeedStats.prototype = {
	/**
	 * Maximum number of speeds to store
	 * Oldest will be dropped if buffer runs full
	 */
	get maxSpeeds() {
		return this._maxSpeeds;
	},
	/**
	 * Average speed (at the moment)
	 */
	get avg() {
		return this._avg;
	},
	/**
	 * First (oldest) speed recorded
	 */
	get first() {
		return this._speeds[0];
	},
	/**
	 * Last (most recent) speed recorded
	 */
	get last() {
		return this._speeds[this._speeds.length - 1];
	},
	/**
	 * Number of speed statistics currently recorded
	 */
	get length() {
		return this._speeds.length;
	},
	/**
	 * Generator over all recorded speeds
	 */
	get all() {
		for each (let x in this._speeds) {
			yield x;
		}
	},
	/**
	 * Time of last update
	 */
	get lastUpdate() {
		return this._lastTime;
	},
	/**
	 * Bytes in last period
	 */
	get lastBytes() {
		return this._lastBytes;
	},
	_lastTime: 0,
	_lastBytes: 0,
	/**
	 * Adds a new data point based on given downloaded bytes and time
	 * @param bytes (int) Bytes in the period
	 * @param time (int) Time bytes was recorded
	 */
	add: function DSS_add(bytes, time) {
		let received = 0;
		if (this._lastTime) {
			let elapsed = (time - this._lastTime) / 1000;
			received = bytes - this._lastBytes;
			let last = Math.max(0, Math.round(received / elapsed));
			this._speeds.push(last);
			if (this._speeds.length > this._maxSpeeds) {
				this._speeds.shift();
			}
			
			this._avg = this._speeds.slice(-10).reduce(function(p, c) (0.8 * p) + (0.2 * c));
		}
		this._lastTime = time;
		this._lastBytes = bytes;
		return received;
	},
	/**
	 * Clears all statistics
	 */
	clear: function DSS_clear() {
		this._speeds = [];
		this._lastTime = this._lastBytes = this._avg = 0;
	}
};
