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
 * The Original Code is DownThemAll! Verificator module
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

const EXPORTED_SYMBOLS = ['Verificator'];

const FREQ = 250;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const module = Cu.import;
const Exception = Components.Exception;

const Prefs = {}, DTA = {};
module("resource://dta/preferences.jsm", Prefs);
module("resource://dta/utils.jsm");
module("resource://dta/timers.jsm");
module("resource://dta/api.jsm", DTA);

const IOService = DTA.IOService;

ServiceGetter(this, "Debug", "@downthemall.net/debug-service;1", "dtaIDebugService");

const Timers = new TimerManager();

const nsICryptoHash = Ci.nsICryptoHash;

const File = new Ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
const FileInputStream = new Ctor('@mozilla.org/network/file-input-stream;1', 'nsIFileInputStream', 'init');
const Hash = new Ctor('@mozilla.org/security/hash;1', 'nsICryptoHash', 'init');
const InputStreamPump = new Ctor('@mozilla.org/network/input-stream-pump;1', 'nsIInputStreamPump', 'init');

function Verificator(download, completeCallback, errorCallback) {
	this.download = download;
	this.completeCallback = completeCallback;
	this.errorCallback = errorCallback;
	
	this.file = new File(download.destinationFile);
	this._pending = this.file.fileSize;

	try {
		if (!(download.hash.type in nsICryptoHash)) {
			throw new Exception("hash method unsupported!");
		}
		this.type = nsICryptoHash[download.hash.type];
		
		this.hash = new Hash(this.type);
		
		this.stream = new FileInputStream(this.file, 0x01, 0766, 0);
		this.download.partialSize = 0;
		this._readNextChunk();
	
		this._timer = Timers.createRepeating(FREQ, this._invalidate, this, true);
	}
	catch (ex) {
		try {
			if (this.stream) {
				this.stream.close();
			}
		}
		catch (ex) {
		}
		Debug.log("verificator::Failed to calculate hash", ex);
		this.errorCallback.call(this.download);
	}
}
Verificator.prototype = {
	_finish: function() {		
		try {
			this.download.partialSize = this.download.totalSize;
			this.download.invalidate();
			
			this.hash = hexdigest(this.hash.finish(false));
			if (this.hash != this.download.hash.sum) {
				Debug.logString("hash mismatch, actual: " + this.hash + " expected: " + this.download.hash.sum);
				this.errorCallback.call(this.download);
			}
			else {
				this.completeCallback.call(this.download);
			}
		}
		catch (ex) {
			Debug.log("verificator::_finish", ex);
			this.errorCallback.call(this.download);
		}
	},
	_readNextChunk: function() {
		if (this._pending <= 0) {
			this.stream.close();
			Timers.killTimer(this._timer);
			Timers.createOneshot(100, this._finish, this);
			return;
		}
		var nextChunk = Math.min(this._pending, 2147483648 /* 2GB */);
		this._pending -= nextChunk;
		new InputStreamPump(this.stream, -1, nextChunk, 0, 0, false).asyncRead(this, null);		
	},
	_invalidate: function() {
		this.download.invalidate();
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsIStreamListener) || iid.equals(cI.nsIRequestObserver)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	onStartRequest: function(r, c) {
	},
	onStopRequest: function(request, c) {
		this._readNextChunk();
	},
	onDataAvailable: function(request, c, stream, offset, count) {
		try {
			this.hash.updateFromStream(stream, count);
			this.download.partialSize += count;
		}
		catch (ex) {
			Debug.log("verificator::hash update failed!", ex);
			var reason = 0x804b0002; // NS_BINDING_ABORTED;
			request.cancel(reason);
		}
	}
};