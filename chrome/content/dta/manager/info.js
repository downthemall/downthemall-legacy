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
	get isFullyDisabled() {
		return $('directory', 'renaming', 'hash').every(
			function(e) {
				return e.hasAttribute('disabled');
			}
		);
	},
	load: function DTA_load() {
		try {
			// d is an Array of Downloads
			var downloads = window.arguments[0];
			if (downloads.length == 1) {
				var d = downloads[0];
				$("infoIcon").src = d.largeIcon;
				$("infoURL").value = d.urlManager.url;
				window.title = $("infoDest").value = d.destinationFile;
			
				$("sourcePage").value = d.referrer.spec;
				$('renaming').value = d.mask;
				$('directory').value = d.pathName;
				$('hash').value = d.hash;
				this.item = d;
				Tooltip.start(d);
			}
			else {
				// more than just one download
				$('infoDest', 'infoURL', 'sourcePage').forEach(
					function(e) {
						e.value = "---";
					}
				);
				$("hash").setAttribute('readonly', 'true');
				$("hash").setAttribute('disabled', 'true');
	
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
				$('directory', 'renaming', 'mask', 'browsedir').forEach(
					function(e) {
						e.setAttribute('readonly', 'true');
						e.setAttribute('disabled', 'true');
					}
				);
			}
			if (this.isFullyDisabled) {
				$('dTaDownloadInfo').buttons = 'accept';
			}			
		} catch(ex) {
			Debug.dump('load', ex);
		}
		window.setTimeout('window.sizeToContent()', 0);
	},
	accept: function DTA_accept() {
		if (this.isFullyDisabled) {
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
					d.pathName = directory;
				}
				if (mask) {
					d.mask = mask;
				}
			}
		);
		
		if (t.length == 1) {
			var d = t[0];
			if ($('hash').isValid) {
				var h = $('hash').value;
				if (!h || !d.hash || h.sum != d.hash.sum) {
					d.hash = h;
					if (h && d.is(COMPLETE)) {
						// have to manually start this guy ;)
						d.verifyHash();
					}
				}
			}
		}
		Tooltip.stop();
		return true;
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
		if (!$('hash').isValid) {
			alert(_('alertinfo'));
			return false;
		}
		return true;
	}
};
