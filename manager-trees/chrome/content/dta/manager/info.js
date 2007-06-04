/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributors:
 *  Nils Maier <MaierMan@web.de>
 *  Stefano Verna <stefano.verna@gmail.com>
 *
 * ***** END LICENSE BLOCK ***** */


var Dialog = {
	load: function DTA_load() {
		make_();
		try {
			this.canvas = $("draw").getContext("2d");
		
			// load dropdownns
			this.ddDirectory = $('directory');
			this.ddRenaming = $('renaming');
		
			// d is an Array of Downloads
			var downloads = window.arguments[0];
			if (downloads.length == 1) {
				var d = downloads[0];
				$("infoURL").value = d.urlManager.usable;
				$("sourcePage").value = d.refPage.spec;
				$('renaming').value = d.mask;
				$('directory').value = d.pathName;
				var caption = document.getAnonymousNodes($("logo"))[0];
				caption.style.backgroundImage = 'url(' + getIcon(d.fileName, 'isMetaLink' in d, 32) + ')';
				caption.style.paddingLeft = '37px';
				this.item = d;
				Dialog.draw();
				return;
			}
			
			// more than just one download
			$("infoURL").value = $("sourcePage").value = "---";

			var mask = downloads[0].mask;
			$('renaming').value = 
				downloads.every(function(e, i, a) { return e.mask == mask; })
				? mask
				: '';

			var dir = String(downloads[0].pathName);
			this.ddDirectory.value = 
				downloads.every(function(e, i, a) { return String(e.pathName) == dir; })
				? dir
				: '';
		
			var normal = this.canvas.createLinearGradient(0,0,0,16);
			normal.addColorStop(0, 'rgba(255,255,255,50)');
			normal.addColorStop(1, '#ECE9D8');
		
			this.canvas.fillStyle = normal;
			this.canvas.fillRect(0,0,300,20);

		} catch(ex) {
			Debug.dump('load', ex);
		}
		window.setTimeout('window.sizeToContent()', 0);
	},
	accept: function DTA_accept() {
		if (!this.check()) {
			return false;
		}
		
		var t = window.arguments[0];
		var win = window.arguments[1];

		var directory = this.ddDirectory.value.trim();
		directory = directory.length ? directory.addFinalSlash() : null;
		
		var mask = this.ddRenaming.value;
		mask = mask.length ? mask : null;
		
		t.forEach(
			function(d) {
				if (d.is(COMPLETE, FINISHING)) {
					return;
				}
				if (directory) {
					d.orginalDirSave = directory;
				}
				if (mask) {
					d.mask = mask;
				}
			}
		);
		
		// XXX: saveing destroys order, saving with putting new entries in the end, or as 2nd entry?
		//['ddRenaming', 'ddDirectory'].forEach(function(e){ Dialog[e].save(); });
		
		return true;
	},
	draw: function DTA_draw() {
		var d = this.item;
		
		var c = d.firstChunk;
		var canvas = this.canvas;
		
		canvas.clearRect(0,0,300,20);

		var prog = canvas.createLinearGradient(0,0,0,16);
		prog.addColorStop(0, 'rgba(96,165,1,255)');
		prog.addColorStop(1, 'rgba(123,214,1,255)');

		var compl = canvas.createLinearGradient(0,0,0,16);
		compl.addColorStop(0, 'rgba(13,141,15,255)');
		compl.addColorStop(1, 'rgba(0,199,56,255)');
		
		var join = "#A5FE2C";
		
		var cancel = canvas.createLinearGradient(0,0,0,16);
		cancel.addColorStop(0, 'rgba(151,58,2,100)');
		cancel.addColorStop(1, 'rgba(255,0,0,100)');
		
		var normal = canvas.createLinearGradient(0,0,0,16);
		normal.addColorStop(0, 'rgba(255,255,255,50)');
		normal.addColorStop(1, '#ECE9D8');
		
		canvas.fillStyle = normal;
		canvas.fillRect(0,0,300,20);

		if (d.is(COMPLETE)) {
			canvas.fillStyle = compl;
			canvas.fillRect(0,0,300,20);
			canvas.fillStyle = join;
			if (!d.join || !d.totalSize) {
				canvas.fillRect(0,16,300,4);
			}
			else {
				canvas.fillRect(0,16,Math.round(d.join.offset/d.totalSize*300),4);
			}
		} else if (d.is(CANCELED)) {
			canvas.fillStyle = cancel;
			canvas.fillRect(0,0,300,20);
		} else if (d.isStarted && d.totalSize) {
			d.chunks.forEach(
				function(c) {
					this.canvas.fillStyle = prog;
					this.canvas.fillRect(Math.round(c.start/d.totalSize*300),0,Math.round(c.size/d.totalSize*300),20);
				},
				this
			);
			canvas.fillStyle = join;
			canvas.fillRect(0,16,Math.round(d.chunks[d.firstChunk].chunkSize/d.totalSize*300),4);
		}
		setTimeout('Dialog.draw();', 150);
	},
	browseDir: function DTA_browseDir() {
		// let's check and create the directory
		var newDir = Utils.askForDir(
			this.ddDirectory.value,
			_("validdestination")
		);
		if (newDir) {
			this.ddDirectory.value = newDir;
		}
	},
	check: function DTA_check() {
		var dir = this.ddDirectory.value.trim();
		if (!dir.length || !this.ddRenaming.value.trim().length) {
			return false;
		}
		if (!Utils.isValidDir(dir)) {
			alert(_("alertfolder"));
			var newDir = Utils.askForDir(null, _("validdestination"));
			this.ddDirectory.value = newDir ? newDir : '';
			return false;
		}
		return true;
	}
};
