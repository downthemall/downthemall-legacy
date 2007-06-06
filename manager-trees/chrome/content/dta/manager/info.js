/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See LICENSE and GPL for details.
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
		
	
			// d is an Array of Downloads
			var downloads = window.arguments[0];
			if (downloads.length == 1) {
				var d = downloads[0];
				$("infoURL").value = d.urlManager.usable;
				$("sourcePage").value = d.refPage.spec;
				$('renaming').value = d.mask;
				$('directory').value = d.pathName;
				$('hash').value = d.hash;
				var caption = document.getAnonymousNodes($("logo"))[0];
				caption.style.backgroundImage = 'url(' + getIcon(d.fileName, 'isMetaLink' in d, 32) + ')';
				caption.style.paddingLeft = '37px';
				this.item = d;
				Dialog.draw();
			}
			else {
				
				// more than just one download
				$("infoURL").value = $("sourcePage").value = "---";
				$("hash").setAttribute('readonly', 'true');
	
				var mask = downloads[0].mask;
				$('renaming').value = 
					downloads.every(function(e, i, a) { return e.mask == mask; })
					? mask
					: '';
	
				var dir = String(downloads[0].pathName);
				$('directory').value = 
					downloads.every(function(e) { return e.pathName == dir; })
					? dir
					: '';

				var normal = this.canvas.createLinearGradient(0,0,0,16);
				normal.addColorStop(0, 'rgba(255,255,255,50)');
				normal.addColorStop(1, '#ECE9D8');
			
				this.canvas.fillStyle = normal;
				this.canvas.fillRect(0,0,300,20);
					
			}				
			if (downloads.every(function(d) { return d.is(COMPLETE, FINISHING); })) {
				$('directory', 'renaming', 'mask').forEach(function(e) { e.setAttribute('readonly', 'true'); });
				$('browsedir').setAttribute('disabled', 'true');
			}
			if ($('directory', 'renaming', 'hash').every(function(e) { return e.hasAttribute('readonly'); })) {
				$('dTaDownloadInfo').buttons = 'accept';
			}			
		} catch(ex) {
			Debug.dump('load', ex);
		}
		window.setTimeout('window.sizeToContent()', 0);
	},
	accept: function DTA_accept() {
		if ($('directory', 'renaming', 'hash').every(function(e) { return e.hasAttribute('readonly'); })) {
			return true;
		}		
		if (!this.check()) {
			return false;
		}
		
		var t = window.arguments[0];
		var win = window.arguments[1];

		var directory = $('directory').value.trim();
		directory = directory.length ? directory.addFinalSlash() : null;
		
		var mask = $('renaming').value;
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
		
		if (t.length == 1) {
			var d = t[0];
			var hash = $('hash').value;
			if (hash && d.hash != hash) {
				d.hash = hash;
				if (d.is(COMPLETE)) {
					// have to manually start this guy ;)
					d.verifyHash();
				}
			}
		}
		
		// XXX: saveing destroys order, saving with putting new entries in the end, or as 2nd entry?
		
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
			$('directory').value,
			_("validdestination")
		);
		if (newDir) {
			$('directory').value = newDir;
		}
	},
	check: function DTA_check() {
		var dir = $('directory').value.trim();
		if (!dir.length || !$('renaming').value.trim().length) {
			return false;
		}
		if (!Utils.validateDir(dir)) {
			alert(_("alertfolder"));
			var newDir = Utils.askForDir(null, _("validdestination"));
			$('directory').value = newDir ? newDir : '';
			return false;
		}
		var hash = $('hash').value;
		if (hash && !DTA_checkHashFormat(hash)) {
			alert(_('alertinfo'));
			return false;
		}
		return true;
	}
};
