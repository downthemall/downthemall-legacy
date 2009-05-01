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

const EXPORTED_SYMBOLS = ['SpeedStats'];

function SpeedStats(maxSpeeds) {
	this._maxSpeeds = maxSpeeds;
	this.clear();
}

SpeedStats.prototype = {
	get maxSpeeds() {
		return this._maxSpeeds;
	},
	get avg() {
		return this._avg;
	},
	get first() {
		return this._speeds[0];
	},
	get last() {
		return this._speeds[this._speeds.length - 1];
	},
	get length() {
		return this._speeds.length;
	},
	get all() {
		for each (let x in this._speeds) {
			yield x;
		}
	},	
	get lastUpdate() {
		return this._lastTime;
	},
	get lastBytes() {
		return this._lastBytes;
	},
	_lastTime: 0,
	_lastBytes: 0,
	add: function DSS_add(bytes, time) {
		let received = 0;
		if (this._lastTime) {
			let elapsed = (time - this._lastTime) / 1000;
			received = bytes - this._lastBytes;
			this._speeds.push(Math.round(received / elapsed));
			if (this._speeds.length > this._maxSpeeds) {
				this._speeds.shift();
			}
			this._avg = 0;
			for each (let s in this._speeds) {
				this._avg += s;
			}
			this._avg = Math.round(this._avg / this._speeds.length);
		}
		this._lastTime = time;
		this._lastBytes = bytes;
		return received;
	},
	clear: function DSS_clear() {
		this._speeds = [];
		this._lastTime = this._lastBytes = this._avg = 0;
	}
};
