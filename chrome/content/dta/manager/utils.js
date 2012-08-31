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
 * The Original Code is DownThemAll!
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007-2010
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

const PREF_CONN = 'network.http.max-connections';

var gMinTrayR = {};
try {
	module("resource://mintrayr/mintrayr.jsm", gMinTrayR);
	var init = function() {
		let self = this;
		let _oc = Dialog.onclose;
		Dialog.onclose = function(evt) {
			if (self.prefs.getExt("downthemall", false)
				&& (self.prefs.getExt("minimizeon", 1) & (1<<1))) {
				evt.preventDefault();
				return false;
			}
			return _oc.apply(Dialog, arguments);
		}
	};

	addEventListener("load", function tray_init() {
		removeEventListener("load", tray_init, false);

		if (gMinTrayR.MinTrayR.length == 3) {
			gMinTrayR = new gMinTrayR.MinTrayR($("traymenu"), "downthemall.watchmanager", init);
		}
		else {
			gMinTrayR = new (function() {
				gMinTrayR.MinTrayR.call(this, $("traymenu"), "downthemall.watchmanager");
				init.call(this);
			})();
		}
	}, false);
}
catch (ex) {
	// no op
}
const Prefs = {
	tempLocation: null,
	
	mappings: [
		['removeCompleted', true],
		['removeAborted', false],
		['removeCanceled', false],
		['autoClose', 'closedta', false],
		['timeout', 300],
		['maxInProgress', 'ntask', 4],
		['maxChunks', 4],
		['setTime', true],
		['showOnlyFilenames', true],
		['conflictResolution', 3],
		['alertingSystem', 'alertbox', (SYSTEMSLASH == '\\') ? 1 : 0],
		['finishEvent', ''],
		['showTooltip', true],
		['maxAutoRetries', 10],
		['autoRetryInterval', 0],
		['autoClearComplete', false],
		['confirmCancel', true],
		['confirmRemove', true],
		['confirmRemoveCompleted', true],
		['permissions', 384],
		['loadEndFirst', 0],
		['flatReplacementChar', '-'],
		['recoverAllHttpErrors', false],
		['speedLimit', -1],
		['resumeOnError', false]
	],

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs(prefName);
	},

	init: function() {
		try {
			ServiceGetter(this, "_dsp", "@mozilla.org/file/directory_service;1", "nsIProperties");
			this._resetConnPrefs();
			this._refreshPrefs();
			Preferences.addObserver('extensions.dta.', this);
			Preferences.addObserver('network.', this);
		}
		catch (ex) {
			Debug.log("failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function(prefName) {
		Debug.logString("pref reload due to: " + prefName);
		for each (let e in this.mappings) {
			let key, pref, def;
			if (!e) {
				return;
			}
			else if (e.length == 3) {
				key = e[0];
				pref = e[1];
				def = e[2];
			}
			else {
				key = e[0];
				pref = key.toLowerCase();
				def = e[1];
			}
			this[key] = Preferences.getExt(pref, def);
		}
		
		let perms = Prefs.permissions;
		if (perms & 384) {
			perms |= 64;
		}
		if (perms & 48) {
			perms |= 8;
		}				
		if (perms & 6) {
			perms |= 1;
		}
		this.dirPermissions = perms;		

		if (!prefName || prefName == 'extensions.dta.saveTemp' || prefName == 'extensions.dta.tempLocation') {
			this._constructTemp();
		}
		// Make this KB
		this.loadEndFirst *= 1024;
		
		if (!prefName || prefName == PREF_CONN) {
			let conns = (this.maxInProgress * this.maxChunks) + 2;
			let cur = Preferences.get(PREF_CONN, conns);
						
			if (conns != cur) {
				Preferences.setExt(PREF_CONN, cur);
			}
			if (conns > cur) {
				Preferences.set(PREF_CONN, conns);
			}
		}
		if (Preferences.getExt('exposeInUA', false)) {
			RequestManipulation.registerHttp('dtaua', /./, RequestManipulation.amendUA);
		}
		else {
			RequestManipulation.unregisterHttp('dtaua');
		}
		Dialog.scheduler = null;
	},
	_constructTemp: function() {
		this.tempLocation = null;		
		if (!Preferences.getExt("saveTemp", true)) {
			return;
		}
		try {
			this.tempLocation = Preferences.getExt("tempLocation", '');
			if (this.tempLocation == '') {
				// #44: generate a default tmp dir on per-profile basis
				// hash the profD, as it would be otherwise a minor information leak
				this.tempLocation = this._dsp.get("TmpD", Ci.nsIFile);
				let profD = hash(this._dsp.get("ProfD", Ci.nsIFile).leafName);
				this.tempLocation.append("dtatmp-" + profD);
			}
			else {
				this.tempLocation = new FileFactory(this.tempLocation);
			}
			if (!(this.tempLocation instanceof Ci.nsIFile)) {
				throw new Exception("invalid value");
			}
			
			let tl = this.tempLocation.clone();
			try {
				if (!tl.exists()) {
					try {
						tl.create(tl.DIRECTORY_TYPE, this.dirPermissions);
					}
					catch (ex) {
						Debug.log("Failed to create temp dir", ex);
						throw new Exception("tempnotaccessible");
					}
				}
				else if (!tl.isDirectory()) {
					throw new Exception("tempnotdir");
				}
				else {
					// Hacky way to check if directory is indeed writable
					tl.append('.dta-check');
					try {
						if (!tl.exists()) {
							tl.create(tl.NORMAL_FILE_TYPE, this.permissions);
						}
						if (tl.exists()) {
							tl.remove(false);
						}
					}
					catch (ex) {
						Debug.log("Failed to check temp dir", ex);
						throw new Exception("tempnotaccessible");
					}
				}
			}
			catch (ex) {
				let nb = $('notifications');
				nb.appendNotification(_(ex.message), 0, null, nb.PRIORITY_WARNING_HIGH, [
					{
						accessKey: null,
						label: _('autofix'),
						callback: function() {
							Preferences.resetExt('saveTemp');
							Preferences.resetExt('tempLocation');
						}
					},
					{
						accessKey: null,
						label: _('manualfix'),
						callback: function() DTA.showPreferences('paneAdvanced')
					}
				]);
				throw ex;
			}
		}
		catch (ex) {
			this.tempLocation = null;
			// XXX: error handling
		}
	},
	shutdown: function() {
		Preferences.removeObserver('extensions.dta.', this);
		Preferences.removeObserver('network.', this);
		this._resetConnPrefs();
	},
	_resetConnPrefs: function() {
		let conn = Preferences.getExt(PREF_CONN, 0);
		if (conn) {
			Preferences.set(PREF_CONN, conn);
			Preferences.setExt(PREF_CONN, 0);
		}
	}
};

const Tooltip = {
	_current: null,
	_mustDraw: true,
	init: function() {
		$(
			'infoPercent',
			'infoSize',
			'canvasGrid',
			'chunkCanvas',
			'speedCanvas',
			'speedAverage',
			'speedCurrent',
			'timeRemaining',
			'timeElapsed'
		).forEach(function(e) this[e.id] = e, this);
	},		 
	start: function(d) {
		this.stop();
		Debug.log("Starting tooltip");
		this._current = d;
		this._mustDraw = true;
		this._timer = Timers.createRepeating(TOOLTIP_FREQ, this.update, this, true);
		this._initUpdateRetries = 0;
		this.initUpdate();
	},
	initUpdate: function() {
		Debug.logString("init");
		let mr = false;
		let box = this.canvasGrid.boxObject;
		this._initUpdateRetries = (this._initUpdateRetries || 0) + 1;
		
		for each (let canvas in [this.speedCanvas, this.chunkCanvas]) {
			try {
				let w = Math.min(box.width, canvas.clientWidth);
				let h = parseInt(canvas.getAttribute('height'));
				if (!isFinite(w) || !isFinite(h) || w <= 1 || h <= 1) {
					throw new Components.Exception("Failed to get dimensions");
				}
				if (w == canvas.width && h == canvas.height) {
					continue;
				}
				canvas.width = w; 
				canvas.height = h;
				Debug.logString("set " + canvas.id + " to " + w + "/" + h);
				mr = true;
			}
			catch (ex) {
				if (this._initUpdateRetries >= 10) {
					Debug.log("initUpdate failed; not retrying", ex);
					return;
				}
				Debug.log("initUpdate failed; retrying", ex);
				Timers.createOneshot(25, this.initUpdate, this);				
				return;
			}
		}
		if (mr && this._initUpdateRetries < 10) {
			this._mustDraw = true;
			Timers.createOneshot(25, this.initUpdate, this);
		}
		this.update();
		this._mustDraw = false;
	},
	stop: function() {
		Debug.log("Stopping tooltip");
		this._current = null;
		if (this._timer) {
			Timers.killTimer(this._timer);
			delete this._timer;
		}
	},	
	update: function() {
		let file = this._current;
		if (!file) {
			return;
		}
		this.updateMetrics(file);
		this.updateChunks(file);
		this.updateSpeeds(file);
	},
	_makeRoundedRectPath: function(ctx,x,y,width,height,radius) {
		ctx.beginPath();
		ctx.moveTo(x, y + radius);
		ctx.lineTo(x, y + height - radius);
		ctx.quadraticCurveTo(x, y + height, x + radius, y + height);
		ctx.lineTo(x + width - radius, y + height);
		ctx.quadraticCurveTo(x + width, y + height, x + width,y + height - radius);
		ctx.lineTo(x + width, y + radius);
		ctx.quadraticCurveTo(x + width, y, x + width - radius, y);
		ctx.lineTo(x + radius, y);
		ctx.quadraticCurveTo(x, y, x, y + radius);
	},
	_createVerticalGradient: function(ctx, height, c1, c2) {
		let g = ctx.createLinearGradient(0, 0, 0, height);
		g.addColorStop(0, c1);
		g.addColorStop(1, c2);
		return g;
	},
	_createInnerShadowGradient: function(ctx, w, c1, c2, c3, c4) {
		let g = ctx.createLinearGradient(0, 0, 0, w);
		g.addColorStop(0, c1);
		g.addColorStop(3.0 / w, c2);
		g.addColorStop(4.0 / w, c3);
		g.addColorStop(1, c4);
		return g;
	},
	updateMetrics: function(file) {
		try {
			if (file.speeds.length && file.is(RUNNING)) {
				this.speedAverage.value = file.speed;
				this.speedCurrent.value = Utils.formatSpeed(file.speeds.last);
			}
			else if (file.is(RUNNING)) {
				this.speedCurrent.value = this.speedAverage.value = _('unknown');
			}
			else {
				this.speedCurrent.value = this.speedAverage.value = _('nal');
			}

			this.infoSize.value = file.dimensionString;//file.totalSize > 0 ? Utils.formatBytes(file.totalSize) : _('unknown');
			this.timeRemaining.value = file.status;
			if (file.is(RUNNING)) {
				this.timeElapsed.value = Utils.formatTimeDelta((Utils.getTimestamp() - file.timeStart) / 1000);
			}
			else {
				this.timeElapsed.value = _('nal');
			}
			this.infoPercent.value = file.percent;
		}
		catch (ex) {
			Debug.log("Tooltip.updateMetrics: ", ex);
		}	
	},
	_usFile: null,
	_usUpdate: -1,
	_usBytes: -1,
	_usState: null,
	updateSpeeds: function(file) {
		try {
			if (!this._mustDraw && file === this._usFile && file.speeds.lastUpdate === this._usUpdate && file.speeds.lastBytes === this._usBytes && file.state == this._usState) {
				return;
			}
			this._usFile = file;
			this._usState = file.state;
			this._usUpdate = file.speeds.lastUpdate;
			this._usBytes = file.speeds.lastBytes;
			
			// we need to take care about with/height
			let canvas = this.speedCanvas;
			let w = canvas.width;
			let h = canvas.height;
			let ctx = canvas.getContext("2d");
			--w; --h;
			
			let boxFillStyle = this._createInnerShadowGradient(ctx, h, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
			let boxStrokeStyle = this._createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
			let graphFillStyle = this._createVerticalGradient(ctx, h - 7, "#FF8B00", "#FFDF38");
			
			ctx.clearRect(0, 0, w, h);
			ctx.save();
			ctx.translate(.5, .5);
			
			ctx.lineWidth = 1;
			ctx.strokeStyle = boxStrokeStyle;
			ctx.fillStyle = boxFillStyle;
				
			// draw container chunks back
			ctx.fillStyle = boxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, w, h, 5);
			ctx.fill();
	
			let step = w / SPEED_COUNT;
	
			if (file.speeds.length > 1) {
				let maxH, minH;
				maxH = minH = file.speeds.first;
				let speeds = [];
				for (let s in file.speeds.all) {
					maxH = Math.max(maxH, s);
					minH = Math.min(minH, s);
					speeds.push(s);
				}
				// special case: all speeds are the same
				if (minH == maxH) {
					speeds = speeds.map(function(speed) { return 12; });
				}
				else {
					let r = (maxH - minH);
					speeds = speeds.map(function(speed) { return 3 + Math.round((h - 6) * (speed - minH) / r); });
				}

				ctx.save();
				ctx.clip();
				[
					{ x:4, y:0, f: this._createVerticalGradient(ctx, h - 7, "#EADF91", "#F4EFB1") },
					{ x:2, y:0, f: this._createVerticalGradient(ctx, h - 7, "#DFD58A", "#D3CB8B") },
					{ x:1, y:0, f: this._createVerticalGradient(ctx, h - 7, "#D0BA70", "#DFCF6F") },
					{ x:0, y:0, f: graphFillStyle, s: this._createVerticalGradient(ctx, h - 7, "#F98F00", "#FFBF37") }
				].forEach(
					function(pass) {
						ctx.fillStyle = pass.f;
						let y = h + pass.y;
						let x = pass.x + 0.5;
								
						ctx.beginPath();
						ctx.moveTo(x, y);
								
						y -= speeds[0];
						ctx.lineTo(x, y);
								
						let slope = (speeds[1] - speeds[0]);
						x += step * .7;
						y -= slope * .7;
						ctx.lineTo(x, y);
								
						for (let j = 1, e = speeds.length - 1; j < e; ++j) {
							y -= slope *.3;
							slope = (speeds[j+1] - speeds[j]);
							y -= slope * .3;
							
							ctx.quadraticCurveTo(step * j, h + pass.y - speeds[j], (x + step * .6), y);
	
							x += step;
							y -= slope * .4;

							ctx.lineTo(x, y);
						}
						x += step * .3;
						y -= slope * .3;
						ctx.lineTo(x, y);
	
						ctx.lineTo(x, h);
						ctx.fill();
								
						if (pass.s) {
							ctx.strokeStyle = pass.s;
							ctx.stroke();
						}
					}
				);
				ctx.restore();
			}
			this._makeRoundedRectPath(ctx, 0, 0, w, h, 3);
			ctx.stroke();
				
			ctx.restore();
		}
		catch(ex) {
			Debug.log("updateSpeedCanvas(): ", ex);
		}
	},
	_ucFile: null,
	_ucDim: null,
	_ucTotal: null,
	_ucState: null,
	updateChunks: function (file) {
		try {
			if (!this._mustDraw && file === this._ucFile && file.state === this._ucState && file.dimensionString === this._ucDim) {
				return;
			}
			this._ucFile = file;
			this._ucState = file.state;
			this._ucDim = file.dimensionString;
			
			let canvas = this.chunkCanvas;
			let width = canvas.width;
			let height = canvas.height;
			let ctx = canvas.getContext("2d");
			--width; --height;
			
			let cheight = height - 15;
	
			// Create gradients
			let chunkFillStyle = this._createVerticalGradient(ctx, cheight, "#A7D533", "#D3F047");
			let boxFillStyle = this._createInnerShadowGradient(ctx, cheight, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
			let boxStrokeStyle = this._createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
			let partialBoxFillStyle = this._createInnerShadowGradient(ctx, 8, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
	
			// clear all
			ctx.clearRect(0, 0, width, height);
			ctx.save();
			ctx.translate(.5, .5);
	
			// draw container chunks back
			ctx.lineWidth = 1;
			ctx.strokeStyle = boxStrokeStyle;
			ctx.fillStyle = boxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, width, cheight, 5);
			ctx.fill();
	
			let b = [];
			if (file.is(COMPLETE)) {
				b.push({
					s: 0,
					w: width
				});
			}
			else if (!file.is(CANCELED)){
				b = file.chunks.map(
					function(chunk) {
						if (file.totalSize <= 0) {
							return {s:0, w: 1};
						}
						return {
							s: Math.ceil(chunk.start / file.totalSize * width),
							w: Math.ceil(chunk.written / file.totalSize * width)
						};
					}
				).sort(function(a, b) { return b.s - a.s; });
			}
	
			ctx.save();
			ctx.clip();
	
			var passes = [
				{ x:0, f: this._createInnerShadowGradient(ctx, cheight, "#AFA259", "#E8D675", "#F2E17E", "#F5F1B8") },
				{ x:1, f: this._createInnerShadowGradient(ctx, cheight, "#9A8F4E", "#B0A359", "#B3A75D", "#BAB78B") },
				{ x:2, f: this._createInnerShadowGradient(ctx, cheight, "#8E8746", "#B0A359", "#8E8746", "#CACB96") },
				{ x:3, f: chunkFillStyle, s:chunkFillStyle }
			];
			
			for each (var chunk in b) {
				for each (var pass in passes) {
					ctx.fillStyle = pass.f;
					this._makeRoundedRectPath(ctx, chunk.s, 0, chunk.w - pass.x + 2, cheight, 3);
					ctx.fill();
					if (pass.s) {
						ctx.lineWidth = 2;
						ctx.strokeStyle = pass.s;
						ctx.stroke();
					}
				}
			}
			ctx.restore();
	
			// draw container chunks border
			this._makeRoundedRectPath(ctx, 0, 0, width, cheight, 5);
			ctx.stroke();
	
			// draw progress back
			ctx.translate(0, cheight + 1);
			ctx.fillStyle = partialBoxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
			ctx.fill();
	
			// draw progress
			if (file.totalSize > 0) {
				ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#5BB136", "#A6D73E");
				this._makeRoundedRectPath(ctx, 0, 0, Math.ceil(file.partialSize / file.totalSize * width), 8, 3);
				ctx.fill();
			}
			else if (file.is(CANCELED)) {
				ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#B12801", "#FFFFFF");;
				this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
				ctx.fill();
			}
	
			// draw progress border
			this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
			ctx.stroke();
	
			ctx.restore();
		}
		catch(ex) {
			Debug.log("updateChunkCanvas(): ", ex);
		}
	}
};
addEventListener('load', function() {
	removeEventListener('load', arguments.callee, false);
	Tooltip.init();
}, false);