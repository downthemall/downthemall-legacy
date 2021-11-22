/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global $, $$, _, Preferences, Dialog, Utils, mapInSitu, RequestManipulation, hash, showPreferences, Timers, defer */
/* global COMPLETE, PAUSED, CANCELED, RUNNING, SPEED_COUNT, TOOLTIP_FREQ */
/* jshint globalstrict: true, strict:true, browser:true */

var PREF_CONN = 'network.http.max-connections';

var gMinTrayR = {};
try {
	Cu.import("resource://mintrayr/mintrayr.jsm", gMinTrayR);
	let self;
	var init = function() {
		function closeWindow(event){
			if (Preferences.getExt('minimize, Dialogtotray', false) &&
				(self.prefs.getExt('minimizeon', 1) & (1<<1))) {
				self.minimize();
				event.preventDefault();
				event.stopPropagation();
				return false;
			}
			// must be in sync with the original command
			return Dialog.close();
		}
		function minimizeWindow(event) {
			if (Preferences.getExt('minimizetotray', false) &&
				(self.prefs.getExt('minimizeon', 1) & (1<<0))) {
				self.minimize();
				event.preventDefault();
				event.stopPropagation();
				return false;
			}
			// must be in sync with the original command
			return window.minimize();
		}
		function hijackButton(newCommand, id) {
			let button = $(id);
			if (!button) {
				// Only available in Firefox 4
				return;
			}

			// Remove old command(s)
			button.removeAttribute('command');
			button.removeAttribute('oncommand');

			// Add ourselves
			button.addEventListener('command', newCommand, false);
		}

		let _oc = Dialog.onclose;
		Dialog.onclose = function(evt) {
			if (self.prefs.getExt("downthemall", false) &&
				(self.prefs.getExt("minimizeon", 1) & (1<<1))) {
				evt.preventDefault();
				return false;
			}
			return _oc.apply(Dialog, arguments);
		};
		hijackButton(closeWindow, "titlebar-close");
		hijackButton(minimizeWindow, "titlebar-min");
	};

	addEventListener("load", function tray_init() {
		removeEventListener("load", tray_init, false);

		if (gMinTrayR.MinTrayR.length === 3) {
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
	log(LOG_DEBUG, "MinTrayR.init", ex);
}

var Prefs = {
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
		['alertingSystem', 'alertbox', (Utils.SYSTEMSLASH === '\\') ? 1 : 0],
		['finishEvent', ''],
		['showTooltip', true],
		['maxAutoRetries', 10],
		['autoRetryInterval', 0],
		['autoClearComplete', false],
		['confirmCancel', true],
		['confirmRemove', true],
		['confirmRemoveCompleted', true],
		['confirmRemoveFailed', true],
		['confirmRemovePaused', true],
		['permissions', 384],
		['loadEndFirst', 0],
		['recoverAllHttpErrors', false],
		['speedLimit', -1],
		['resumeOnError', false],
		['soundsDone', 'sounds.done', true],
		['soundsError', 'sounds.error', true],
		['schedEnabled', 'schedule.enabled', false],
		['schedStart', 'schedule.start', 0],
		['schedEnd', 'schedule.end', 1380],
		['sparseFiles', false],
		['scrollToNew', true],
		['showActions', true],
	],

	// nsIObserver
	observe: function(subject, topic, prefName) {
		this._refreshPrefs(prefName);
	},

	init: function() {
		try {
			this._resetConnPrefs();
			this._refreshPrefs();
			let unload = Preferences.addObserver("extensions.dta.", this);
			addEventListener("unload", function PrefUnload() {
				removeEventListener("unload", PrefUnload, false);
				unload();
			}, false);
		}
		catch (ex) {
			log(LOG_ERROR, "failed to add pref-observer", ex);
		}
	},

	_refreshPrefs: function(prefName) {
		log(LOG_DEBUG, "pref reload due to: " + prefName);
		for (let e of this.mappings) {
			let key, pref, def;
			if (!e) {
				return;
			}
			else if (e.length === 3) {
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

		let perms = 384 | Prefs.permissions;
		if (Prefs.permissions !== perms) {
			// Sanity check
			Prefs.permissions = perms;
			Preferences.setExt("permissions", perms);
		}
		if (perms & parseInt("600", 8)) {
			perms |= parseInt("100", 8);
		}
		if (perms & parseInt("60", 8)) {
			perms |= parseInt("10", 8);
		}
		if (perms & 6) {
			perms |= 1;
		}
		this.dirPermissions = perms;

		if (!prefName || prefName === 'extensions.dta.saveTemp' ||
			prefName === 'extensions.dta.tempLocation') {
			this._constructTemp();
		}
		// Make this KB
		this.loadEndFirst *= 1024;

		if (!prefName) {
			this._baselineConns = Preferences.get(PREF_CONN, this._baselineConns);
			Preferences.setExt(PREF_CONN, this._baselineConns);
		}

		if (Preferences.getExt('exposeInUA', false)) {
			RequestManipulation.registerHttp('dtaua', /./, RequestManipulation.amendUA);
		}
		else {
			RequestManipulation.unregisterHttp('dtaua');
		}
		if (this.showActions) {
			$("actionsbox").setAttribute("show", "true");
		}
		else {
			$("actionsbox").removeAttribute("show");
		}

		Dialog.scheduler = null;
	},
	_baselineConns: 30,
	_currentConns: 0,
	refreshConnPrefs: function(downloads) {
		let conns = 0;
		for (let i = 0, e = downloads.length; i < e; i++) {
			conns += downloads[i].activeChunks;
		}
		conns = Math.max(this._baselineConns, Math.min(50, conns));
		if (this._currentConns !== conns) {
			Preferences.set(PREF_CONN, conns);
			this._currentConns = conns;
		}
	},
	_constructTemp: function() {
		this.tempLocation = null;
		if (!Preferences.getExt("saveTemp", true)) {
			return;
		}
		try {
			this.tempLocation = Preferences.getExt("tempLocation", '');
			if (!this.tempLocation) {
				// #44: generate a default tmp dir on per-profile basis
				// hash the profD, as it would be otherwise a minor information leak
				this.tempLocation = Services.dirsvc.get("TmpD", Ci.nsIFile);
				let profD = hash(Services.dirsvc.get("ProfD", Ci.nsIFile).leafName);
				this.tempLocation.append("dtatmp-" + profD);
			}
			else {
				this.tempLocation = new Instances.LocalFile(this.tempLocation);
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
						log(LOG_ERROR, "Failed to create temp dir", ex);
						throw new Exception("temp.notaccessible");
					}
				}
				else if (!tl.isDirectory()) {
					throw new Exception("temp.notdir");
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
						log(LOG_ERROR, "Failed to check temp dir", ex);
						throw new Exception("temp.notaccessible");
					}

					if (!Preferences.getExt("tempLocation.warned", false)) {
						Preferences.setExt("tempLocation.warned", true);
						throw new Exception("temp.warnnnonerecommended");
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
						label: _('manualfix3'),
						callback: function() {
							showPreferences('paneAdvanced');
						}
					}
				]);
				throw ex;
			}
		}
		catch (ex) {
			log(LOG_ERROR, "failed to set up temp directory: " +
				(this.tempLocation ? this.tempLocation.path || this.tempLocation : "null"), ex);
			this.tempLocation = null;
			// XXX: error handling
		}
	},
	shutdown: function() {
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

var Tooltip = {
	_current: null,
	_mustDraw: true,
	init: function() {
		$(
			'infoPercent',
			'infoSize',
			'canvasGrid',
			'chunkCanvas',
			'speedCanvas',
			'speedRow',
			'speedAverage',
			'speedCurrent',
			'timeRemaining',
			'timeElapsed'
		).forEach(function(e) { this[e.id] = e; }, this);
		this.boundInitUpdate = this.initUpdate.bind(this);
	},
	start: function(d, inTip) {
		this.stop();
		this._current = d;
		this._mustDraw = true;
		this._inTip = inTip;
		if (this._inTip && d.state !== RUNNING) {
			this.speedCanvas.hidden = true;
			this.speedRow.collapsed = true;
		}
		else {
			this.speedCanvas.hidden = false;
			this.speedRow.collapsed = false;
		}
		this._timer = Timers.createRepeating(TOOLTIP_FREQ, this.update, this, true);
		this._initUpdateRetries = 0;
		this.initUpdate();
	},
	initUpdate: function() {
		log(LOG_DEBUG, "init");
		let mr = false;
		let box = this.canvasGrid.boxObject;
		this._initUpdateRetries = (this._initUpdateRetries || 0) + 1;

		let canvases = [this.chunkCanvas];
		if (!this.speedCanvas.hidden) {
			canvases.push(this.speedCanvas);
		}
		for (let canvas of canvases) {
			try {
				let w = Math.min(box.width, canvas.clientWidth);
				let h = parseInt(canvas.getAttribute('height'), 10);
				if (!isFinite(w) || !isFinite(h) || w <= 1 || h <= 1) {
					throw new Components.Exception("Failed to get dimensions");
				}
				if (w === canvas.width && h === canvas.height) {
					continue;
				}
				canvas.width = w;
				canvas.height = h;
				log(LOG_DEBUG, "set " + canvas.id + " to " + w + "/" + h);
				mr = true;
			}
			catch (ex) {
				if (this._initUpdateRetries >= 10) {
					log(LOG_ERROR, "initUpdate failed; not retrying", ex);
					return;
				}
				log(LOG_DEBUG, "initUpdate failed; retrying", ex);
				defer(this.boundInitUpdate);
				return;
			}
		}
		if (mr && this._initUpdateRetries < 10) {
			this._mustDraw = true;
			defer(this.boundInitUpdate);
		}
		this.update();
		this._mustDraw = false;
	},
	stop: function() {
		this._current = null;
		if (this._timer) {
			Timers.killTimer(this._timer);
			delete this._timer;
		}
	},
	update: function() {
		let file = this._current;
		if (!file) {
			log(LOG_DEBUG, "no current");
			return;
		}
		this.updateMetrics(file);

		if (!file || !file.speeds) {
			return;
		}

		if (!this._mustDraw &&
			file === this._file &&
			file.speeds.lastUpdate === this._update &&
			file.speeds.lastBytes === this._bytes &&
			file.state === this._state) {
			return;
		}

		log(LOG_DEBUG, "update");
		this._file = file;
		this._state = file.state;
		this._update = file.speeds.lastUpdate;
		this._bytes = file.speeds.lastBytes;

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
	_createInnerShadowGradient: function(ctx, w, colors) {
		let g = ctx.createLinearGradient(0, 0, 0, w);
		g.addColorStop(0, colors[0]);
		g.addColorStop(3.0 / w, colors[1]);
		g.addColorStop(4.0 / w, colors[2]);
		g.addColorStop(1, colors[3]);
		return g;
	},
	updateMetrics: function(file) {
		try {
			const state = file.state;
			if (state === RUNNING && file.speeds.length) {
				this.speedAverage.value = file.speed;
				this.speedCurrent.value = Utils.formatSpeed(file.speeds.last);
			}
			else if (state === RUNNING) {
				this.speedCurrent.value = this.speedAverage.value = _('unknown');
			}
			else {
				this.speedCurrent.value = this.speedAverage.value = _('nal');
			}
			this.speedAverage.setAttribute("tooltiptext", this.speedAverage.value);
			this.speedCurrent.setAttribute("tooltiptext", this.speedCurrent.value);

			this.infoSize.value = file.dimensionString;
			this.timeRemaining.value = file.status;
			if (state === RUNNING) {
				this.timeElapsed.value = Utils.formatTimeDelta((Utils.getTimestamp() - file.timeStart) / 1000);
			}
			else {
				this.timeElapsed.value = _('nal');
			}
			this.infoPercent.value = file.percent;
			this.timeRemaining.setAttribute("tooltiptext", this.timeRemaining.value);
			this.timeElapsed.setAttribute("tooltiptext", this.timeElapsed.value);
		}
		catch (ex) {
			log(LOG_ERROR, "Tooltip.updateMetrics: ", ex);
		}
	},
	_usFile: null,
	_usUpdate: -1,
	_usBytes: -1,
	_usState: null,
	_usPasses: [
		{ x:4, y:0, f: ["#EADF91", "#F4EFB1"] },
		{ x:2, y:0, f: ["#DFD58A", "#D3CB8B"] },
		{ x:1, y:0, f: ["#D0BA70", "#DFCF6F"] },
		{ x:0, y:0, f: ["#FF8B00", "#FFDF38"], s: "#F98F00" }
	],
	_usAvgPass: { x:0, y:0, s: "rgba(0,0,200,0.3)", sw: 2 },
	updateSpeeds: function(file) {
		try {
			// we need to take care about with/height
			let canvas = this.speedCanvas;
			let w = canvas.width;
			let h = canvas.height;
			let ctx = canvas.getContext("2d");
			--w; --h;

			let boxFillStyle = this._createInnerShadowGradient(ctx, h, ["#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4"]);
			let boxStrokeStyle = this._createInnerShadowGradient(ctx, 8, ["#816A1D", "#E7BE34", "#F8CC38", "#D8B231"]);

			ctx.clearRect(0, 0, w, h);
			ctx.save();
			ctx.translate(0.5, 0.5);

			ctx.lineWidth = 1;
			ctx.strokeStyle = boxStrokeStyle;
			ctx.fillStyle = boxFillStyle;

			// draw container chunks back
			ctx.fillStyle = boxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, w, h, 5);
			ctx.fill();

			if (file.speeds.length > 1) {
				let maxH, minH;
				maxH = minH = file.speeds.first;
				let speeds = [];
				for (let s of file.speeds.all) {
					maxH = Math.max(maxH, s);
					minH = Math.min(minH, s);
					speeds.push(s);
				}
				let aspeeds = [];
				for (let s of file.speeds.allAvg) {
					aspeeds.push(s);
				}
				// special case: all speeds are the same
				if (minH === maxH) {
					mapInSitu(speeds, function(speed) { return 12; });
					mapInSitu(aspeeds, function(speed) { return 12; });
				}
				else {
					let r = (maxH - minH);
					mapInSitu(speeds, function(speed) { return 3 + Math.round((h - 6) * (speed - minH) / r); });
					mapInSitu(aspeeds, function(speed) { return 3 + Math.round((h - 6) * (speed - minH) / r); });
				}

				ctx.save();
				ctx.clip();

				const step = w / (SPEED_COUNT - 1);
				const draw = (function draw(pass, spds) {
					let y = h + pass.y;
					let x = pass.x + 0.5;

					ctx.beginPath();
					ctx.moveTo(x, y);

					y -= spds[0];
					if (pass.f) {
						ctx.lineTo(x, y);
					}
					else {
						ctx.moveTo(x, y);
					}

					let slope = (spds[1] - spds[0]);
					x += step * 0.7;
					y -= slope * 0.7;
					ctx.lineTo(x, y);

					for (let j = 1, e = spds.length - 1; j < e; ++j) {
						y -= slope * 0.3;
						slope = (spds[j+1] - spds[j]);
						y -= slope * 0.3;

						ctx.quadraticCurveTo(step * j, h + pass.y - spds[j], (x + step * 0.6), y);

						x += step;
						y -= slope * 0.4;

						ctx.lineTo(x, y);
					}
					x += step * 0.3;
					y -= slope * 0.3;
					ctx.lineTo(x, y);

					if (pass.f) {
						ctx.lineTo(x, h);
						ctx.fillStyle = this._createVerticalGradient(ctx, h - 7, pass.f[0], pass.f[1]);
						ctx.fill();
					}

					if (pass.s) {
						ctx.lineWidth = pass.sw || 1;
						ctx.strokeStyle = pass.s;
						ctx.stroke();
					}
				}).bind(this);

				for (let pass of this._usPasses) {
					draw(pass, speeds);
				}
				draw(this._usAvgPass, aspeeds);
				ctx.restore();
			}
			this._makeRoundedRectPath(ctx, 0, 0, w, h, 3);
			ctx.stroke();

			ctx.restore();
		}
		catch(ex) {
			log(LOG_ERROR, "updateSpeedCanvas(): ", ex);
		}
	},
	_ucFile: null,
	_ucDim: null,
	_ucTotal: null,
	_ucState: null,
	_ucPasses: [
		{ x:0, fs: ["#AFA259", "#E8D675", "#F2E17E", "#F5F1B8"] },
		{ x:1, fs: ["#9A8F4E", "#B0A359", "#B3A75D", "#BAB78B"] },
		{ x:2, fs: ["#8E8746", "#B0A359", "#8E8746", "#CACB96"] },
		{ x:3, f: function(i) {
			function c(a) { return Math.max(0, Math.min(360, a)); }
			return [
				"hsl(" + c(77.64 + 7 * (i - 2)) + ",65.88%,51.76%)",
				"hsl(" + c(70.59 + 4 * (2 - 1)) + ",85.10%,61.18%)"
				];
		}, s: true }
	],
	updateChunks: function (file) {
		try {
			let canvas = this.chunkCanvas;
			let width = canvas.width;
			let height = canvas.height;
			let ctx = canvas.getContext("2d");
			--width; --height;

			let cheight = height - 15;

			// Create gradients
			let boxFillStyle =
				this._createInnerShadowGradient(ctx, cheight, ["#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4"]);
			let boxStrokeStyle =
				this._createInnerShadowGradient(ctx, 8, ["#816A1D", "#E7BE34", "#F8CC38", "#D8B231"]);
			let partialBoxFillStyle =
				this._createInnerShadowGradient(ctx, 8, ["#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4"]);

			// clear all
			ctx.clearRect(0, 0, width, height);
			ctx.save();
			ctx.translate(0.5, 0.5);

			// draw container chunks back
			ctx.lineWidth = 1;
			ctx.strokeStyle = boxStrokeStyle;
			ctx.fillStyle = boxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, width, cheight, 5);
			ctx.fill();

			let b = [];
			const state = file.state;
			if (state === COMPLETE) {
				b.push({
					s: 0,
					w: width
				});
			}
			else if (state !== CANCELED){
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

			let bl = b.length;
			for (let pass of this._ucPasses) {
				for (var [i, chunk] in Iterator(b)) {
					if (pass.fs) {
						ctx.fillStyle = this._createInnerShadowGradient(ctx, cheight, pass.fs);
					}
					if (pass.f) {
						let [f1, f2] = pass.f(bl === 1 ? 2 : bl - i);
						ctx.fillStyle = this._createVerticalGradient(ctx, cheight, f1, f2);
					}
					this._makeRoundedRectPath(ctx, chunk.s, 0, chunk.w - pass.x + 2, cheight, 3);
					ctx.fill();
					if (pass.s) {
						ctx.lineWidth = 2;
						ctx.strokeStyle = ctx.fillStyle;
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
				if (state === PAUSED) {
					ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#e0b400", "#FFCC00");
				}
				else {
					ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#5BB136", "#A6D73E");
				}
				this._makeRoundedRectPath(ctx, 0, 0, Math.ceil(file.partialSize / file.totalSize * width), 8, 3);
				ctx.fill();
			}
			else if (file.isOf(CANCELED | PAUSED)) {
				if (state === PAUSED) {
					ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#e0b400", "#ffeea8");
				}
				else {
					ctx.fillStyle = this._createVerticalGradient(ctx, 8, "#B12801", "#FFFFFF");
				}
				this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
				ctx.fill();
			}

			// draw progress border
			this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
			ctx.stroke();

			ctx.restore();
		}
		catch(ex) {
			log(LOG_ERROR, "updateChunkCanvas(): ", ex);
		}
	}
};

addEventListener('load', function loadUtils() {
	removeEventListener('load', loadUtils, false);
	Tooltip.init();
}, false);
