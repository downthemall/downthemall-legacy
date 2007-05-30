const TOOLTIP_FREQ = 500;
var Tooltip = {
	_current: null,
	show: function(event) {
		try {
			if (!Preferences.getDTA("showtooltip", true)) {
				return false;
			}
			var result;
			var row = {};
			tree.box.getCellAt(event.clientX, event.clientY, row, {}, {});
			if (row.value == -1) {
				return false;
			}
			var d = tree.at(row.value);
			$("infoIcon").src = d.largeIcon;
			$("infoURL").value = d.urlManager.url;
			$("infoDest").value = d.dirSave + d.destinationName;
	
			this._current = d;
			this.updateSpeedCanvas();
			this.updateChunkCanvas();
			
			return true;
		}
		catch(ex) {
			Debug.dump("Tooltip.show():", ex);
		}
		return false;
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
		var g = ctx.createLinearGradient(0, 0, 0, height);
		g.addColorStop(0, c1);
		g.addColorStop(1, c2);
		return g;
	},
	_createInnerShadowGradient: function(ctx, w, c1, c2, c3, c4) {
		var g = ctx.createLinearGradient(0, 0, 0, w);
		g.addColorStop(0, c1);
		g.addColorStop(3.0 / w, c2);
		g.addColorStop(4.0 / w, c3);
		g.addColorStop(1, c4);
		return g;
	},
	updateSpeedCanvas: function() {
		var file = this._current;
		if (!file) {
			return;
		}
		try {
			// we need to take care about with/height
			var canvas = $("speedCanvas");
			var width = canvas.width = canvas.clientWidth;
			var height = canvas.height = canvas.clientHeight;
			var ctx = canvas.getContext("2d");
			--width; --height;
			
			var boxFillStyle = this._createInnerShadowGradient(ctx, height, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
			var boxStrokeStyle = this._createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
			var graphFillStyle = this._createVerticalGradient(ctx, height - 7, "#FF8B00", "#FFDF38");
			
			ctx.clearRect(0, 0, width, height);
			ctx.save();
			ctx.translate(.5, .5);
			
			ctx.lineWidth = 1;
			ctx.strokeStyle = boxStrokeStyle;
			ctx.fillStyle = boxFillStyle;
				
			// draw container chunks back
			ctx.fillStyle = boxFillStyle;
			this._makeRoundedRectPath(ctx, 0, 0, width, height, 5);
			ctx.fill();
	
			var step = Math.floor(width / (SPEED_COUNT - 1));
	
			if (file.speeds.length > 2) {
				var maxH, minH;
				maxH = minH = file.speeds[0];
				for (var i = 1, e = file.speeds.length; i < e; ++i) {
						if (file.speeds[i] > maxH) maxH = file.speeds[i];
						if (file.speeds[i] < minH) minH = file.speeds[i];
				}
				if (minH == maxH) {
					var s = file.speeds.map(function(speed) { return 12; });
				}
				else {
					var r = (maxH - minH);
					var s = file.speeds.map(function(speed) { return 3 + Math.round((height - 6) * (speed - minH) / r); });
				}
				Debug.dump("step vec: " + s + "\n" + file.speeds + "\n" + file.speeds.map(function(speed) { return Math.round(100 * (speed - minH) / r); }));
					
				ctx.save();
				ctx.clip();
				[
					{ x:4, y:0, f:this._createVerticalGradient(ctx, height - 7, "#EADF91", "#F4EFB1") },
					{ x:2, y:0, f:this._createVerticalGradient(ctx, height - 7, "#DFD58A", "#D3CB8B") },
					{ x:1, y:0, f:this._createVerticalGradient(ctx, height - 7, "#D0BA70", "#DFCF6F") },
					{ x:0, y:0, f:graphFillStyle, s:this._createVerticalGradient(ctx, height - 7, "#F98F00", "#FFBF37") }
				].forEach(
					function(pass) {
						ctx.fillStyle = pass.f;
						var y = height + pass.y;
						var x = pass.x + 0.5;
								
						ctx.beginPath();
						ctx.moveTo(x, y);
								
						y = y - s[0];
						ctx.lineTo(x, y);
								
						var slope = (s[1] - s[0]);
						x = x + step * .7;
						y = y - slope * .7;
						ctx.lineTo(x, y);
								
						for (var j = 1, e = s.length - 1; j < e; ++j) {
							x = x + step * .3;
							y = y - slope *.3;
	
							slope = (s[j+1] - s[j]);
							x = x + step * .3;
							y = y - slope * .3;
							ctx.quadraticCurveTo(step * j, height + pass.y - s[j], x, y);
	
							x = x + step * .4;
							y = y - slope * .4;
							ctx.lineTo(x, y);
						}
								
						x = x + step * .3;
						y = y - slope * .3;
						ctx.lineTo(x, y);
	
						ctx.lineTo(x, height);
						ctx.fill();
								
						if (pass.s) {
							ctx.strokeStyle = pass.s;
							ctx.stroke();
						}
					}
				);
				ctx.restore();
			}
			this._makeRoundedRectPath(ctx, 0, 0, width, height, 3);
			ctx.stroke();
				
			ctx.restore();
	
			setTimeout("Tooltip.updateSpeedCanvas()", TOOLTIP_FREQ);
		}
		catch(ex) {
			Debug.dump("updateSpeedCanvas(): ", ex);
		}
	},
	updateChunkCanvas: function () {
		var file = this._current;
		if (!file) {
			return;
		}
		
		try {
	
			var canvas = $("chunkCanvas");
			var width = canvas.width = canvas.clientWidth;
			var height = canvas.height = canvas.clientHeight;
			var ctx = canvas.getContext("2d");
			--width; --height;
			
			var cheight = height - 9;
	
			// Create gradients
			var chunkFillStyle = this._createVerticalGradient(ctx, cheight, "#A7D533", "#D3F047");
			var partialFillStyle = this._createVerticalGradient(ctx, 8, "#5BB136", "#A6D73E");
			var boxFillStyle = this._createInnerShadowGradient(ctx, cheight, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
			var boxStrokeStyle = this._createInnerShadowGradient(ctx, 8, "#816A1D", "#E7BE34", "#F8CC38", "#D8B231");
			var partialBoxFillStyle = this._createInnerShadowGradient(ctx, 8, "#B1A45A", "#F1DF7A", "#FEEC84", "#FFFDC4");
	
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
	
			var b = [];
			if (file.is(COMPLETE)) {
				b.push({
					s: 0,
					w: width
				});
			} else if (file.is(CANCELED)) {
	
			} else if (file.isStarted) {
				b = file.chunks.map(
					function(chunk) {
						if (file.totalSize <= 0) {
							return {s:0, w: 0};
						}
						return {
							s: Math.ceil(chunk.start / file.totalSize * width),
							w: Math.ceil(chunk.written / file.totalSize * width)
						};
					}
				);
			}
	
			ctx.save();
			ctx.clip();
	
			var passes = [
				{ x:3, f: this._createInnerShadowGradient(ctx, cheight, "#AFA259", "#E8D675", "#F2E17E", "#F5F1B8") },
				{ x:2, f: this._createInnerShadowGradient(ctx, cheight, "#9A8F4E", "#B0A359", "#B3A75D", "#BAB78B") },
				{ x:1, f: this._createInnerShadowGradient(ctx, cheight, "#8E8746", "#B0A359", "#8E8746", "#CACB96") },
				{ x:0, f: chunkFillStyle, s:chunkFillStyle }
			];
			
		
			b.forEach(
				function(chunk) {
					passes.forEach(
						function(pass) {
							ctx.fillStyle = pass.f;
							this._makeRoundedRectPath(ctx, chunk.s + pass.x + 0.5, 0, chunk.w, cheight, 3);
							ctx.fill();
							if (pass.s) {
								ctx.lineWidth = 2;
								ctx.strokeStyle = pass.s;
								ctx.stroke();
							}
						},
						this
					)
				},
				this
			);
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
				ctx.fillStyle = partialFillStyle;
				this._makeRoundedRectPath(ctx, 0, 0, Math.ceil(file.partialSize / file.totalSize * width), 8, 3);
				ctx.fill();
			}
	
			// draw progress border
			this._makeRoundedRectPath(ctx, 0, 0, width, 8, 3);
			ctx.stroke();
	
			ctx.restore();
	
			setTimeout("Tooltip.updateChunkCanvas()", TOOLTIP_FREQ);
	
		} catch(ex) {
			Debug.dump("updateChunkCanvas(): ", ex);
		}
	},
	stopCanvas: function() {
		this._current = null;
	}
}