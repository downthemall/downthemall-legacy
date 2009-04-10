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
 * The Initial Developers of the Original Code are Stefano Verna and Federico Parodi
 * Portions created by the Initial Developers are Copyright (C) 2004-2007
 * the Initial Developers. All Rights Reserved.
 *
 * Contributor(s):
 *    Stefano Verna <stefano.verna@gmail.com>
 *    Federico Parodi <f.parodi@tiscali.it>
 *    Nils Maier <MaierMan@web.de>
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
 
const TOOLTIP_FREQ = 1000;
const SPEED_COUNT = 60;
const SPEED_NUMAVG = 10;

var Tooltip = {
	_current: null,
	init: function() {
		try {
			// check if we support 2d-canvas
			$('chunkCanvas').getContext('2d');
			this.progress = $('infoPercent');
			$('chunkAlt').parentNode.removeChild($('chunkAlt'));
		}
		catch (ex) {
			// we don't support 2d-canvas
			this.updateChunks = this.updateChunksAlt;
			this.updateSpeeds = function() {};
			for each (var node in $('chunkStack', 'speedCanvas')) {
				node.parentNode.removeChild(node);
			}
			$('infoPercentAlt').id = 'infoPercent';
		}
	},		 
	start: function(d) {
		this._current = d;
		this._timer = new Timer('Tooltip.update()', TOOLTIP_FREQ, true, true);
		// 1.9+, causes some flickering but anyway :p
		new Timer('Tooltip.initUpdate()', 25);
	},
	initUpdate: function() {
		let box = $('canvasGrid').boxObject;
		for each (let canvas in $('chunkCanvas', 'speedCanvas')) {
			canvas.width = Math.min(box.width, canvas.clientWidth);
			try {
				canvas.height = parseInt(canvas.getAttribute('height'));
			}
			catch (ex) {
				Debug.log("tt: failed to set height", ex);
			}
		}		
		this.update();
	},
	stop: function() {
		this._current = null;
		if (this._timer) {
			this._timer.kill();
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
				$('speedAverage').value = file.speed;
				$('speedCurrent').value = Utils.formatBytes(file.speeds[file.speeds.length - 1]) + "/s";;
			}
			else if (file.is(RUNNING)) {
				$('speedCurrent').value = $('speedAverage').value = _('unknown');
			}
			else {
				$('speedCurrent').value = $('speedAverage').value = _('nal');
			}

			$('infoSize').value = file.dimensionString;//file.totalSize > 0 ? Utils.formatBytes(file.totalSize) : _('unknown');
			$('timeRemaining').value = file.status;
			if (file.is(RUNNING)) {
				$('timeElapsed').value = Utils.formatTimeDelta((Utils.getTimestamp() - file.timeStart) / 1000);
			}
			else {
				$('timeElapsed').value = _('nal');
			}
			$('infoPercent').value = file.percent;
		}
		catch (ex) {
			Debug.log("Tooltip.updateMetrics: ", ex);
		}	
	},
	updateSpeeds: function(file) {
		try {
			// we need to take care about with/height
			let canvas = $("speedCanvas");
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
				maxH = minH = file.speeds[0];
				for each (let s in file.speeds) {
					maxH = Math.max(maxH, s);
					minH = Math.min(minH, s);
				}
				// special case: all speeds are the same
				let s;
				if (minH == maxH) {
					s = file.speeds.map(function(speed) { return 12; });
				}
				else {
					let r = (maxH - minH);
					s = file.speeds.map(function(speed) { return 3 + Math.round((h - 6) * (speed - minH) / r); });
				}

				ctx.save();
				ctx.clip();
				[
					{ x:4, y:0, f:this._createVerticalGradient(ctx, h - 7, "#EADF91", "#F4EFB1") },
					{ x:2, y:0, f:this._createVerticalGradient(ctx, h - 7, "#DFD58A", "#D3CB8B") },
					{ x:1, y:0, f:this._createVerticalGradient(ctx, h - 7, "#D0BA70", "#DFCF6F") },
					{ x:0, y:0, f:graphFillStyle, s:this._createVerticalGradient(ctx, h - 7, "#F98F00", "#FFBF37") }
				].forEach(
					function(pass) {
						ctx.fillStyle = pass.f;
						let y = h + pass.y;
						let x = pass.x + 0.5;
								
						ctx.beginPath();
						ctx.moveTo(x, y);
								
						y -= s[0];
						ctx.lineTo(x, y);
								
						let slope = (s[1] - s[0]);
						x += step * .7;
						y -= slope * .7;
						ctx.lineTo(x, y);
								
						for (let j = 1, e = s.length - 1; j < e; ++j) {
							y -= slope *.3;
							slope = (s[j+1] - s[j]);
							y -= slope * .3;
							
							ctx.quadraticCurveTo(step * j, h + pass.y - s[j], (x + step * .6), y);
	
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
	updateChunksAlt: function(file) {
		let meter = $('chunkProgressAlt');
		if (file.is(RUNNING) && 0 >= file.totalSize) {
			meter.mode = 'undetermined';
		}
		else {
			meter.mode = 'determined';
			meter.setAttribute('value', file.percent);
		}
	},
	updateChunks: function (file) {
		try {
			let canvas = $("chunkCanvas");
			let width = canvas.width;
			let height = canvas.height;
			let ctx = canvas.getContext("2d");
			--width; --height;
			
			let cheight = height - 9;
	
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
					this._makeRoundedRectPath(ctx, chunk.s, 0, chunk.w - pass.x, cheight, 3);
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
addEventListener('load', function() { Tooltip.init(); }, false);