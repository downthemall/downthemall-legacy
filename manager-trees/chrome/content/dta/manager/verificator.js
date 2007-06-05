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
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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
 
 function Verificator(download) {
	this.download = download;
	this.file = new FileFactory(download.destinationFile);
	this.cmp = download.hash.trim().toLowerCase();
	this.CH = Ci.nsICryptoHash;

	download.state = FINISHING;
	download.status =  _("verify");
	try {
		switch (this.cmp.length) {
			case 32: this.type = this.CH.MD5; break;
			case 40: this.type = this.CH.SHA1; break;
			default: throw new Components.Exception("hash method unsupported!");
		}
		this.hash = Cc["@mozilla.org/security/hash;1"]
			.createInstance(this.CH);
		this.hash.init(this.type);
		
		var nsIFI = Ci.nsIFileInputStream;
		this.stream = Cc['@mozilla.org/network/file-input-stream;1']
			.createInstance(Ci.nsIFileInputStream);
		this.stream.init(this.file, 0x01, 0766, 0);
		this.pump = Cc['@mozilla.org/network/input-stream-pump;1']
			.createInstance(Ci.nsIInputStreamPump);
		this.pump.init(this.stream, 0, -1, 0, 0, true);
		this.pump.asyncRead(this, null);
	}
	catch (ex) {
		try {
			if (this.stream) {
				this.stream.close();
			}
		}
		catch (ex) {
		}
		alert("Failed to verify the file!\n" + ex);
		download.completeDownload();
	}
}
Verificator.prototype = {
	_delete: function() {
		try {
			if (this.file.exists()) {
				this.file.remove(false);
			}
		}
		catch (ex) {
			alert("Failed to remove file\n" + ex);
		}
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(cI.nsIRequestObserver)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {
	},
	onStopRequest: function(request, c) {
		this.hash = hexdigest(this.hash.finish(false));
		if (this.hash != this.cmp) {
			var act = DTA_confirm(_('verifyerrortitle'), _('verifyerrortext', [this.cmp, this.hash]), _('retry'), _('delete'), _('keep'));
			switch (act) {
				case 0: this.download.reDownload(); return;
				case 1: this._delete(); this.download.cancel(); return;
			}
		}
		this.download.completeDownload();
	},
	onDataAvailable: function(request, c, stream, offset, count) {
		try {
			this.hash.updateFromStream(stream, count);
			this.download.partialSize = offset;
			this.download.invalidate();
		}
		catch (ex) {
			Debug.dump("hash update failed!", ex);
			var reason = 0x804b0002; // NS_BINDING_ABORTED;
			request.cancel(reason);
		}
	}
};