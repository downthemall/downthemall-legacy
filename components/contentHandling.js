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
 * The Original Code is DownThemAll! Content Handling components
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

function include(uri) {
	Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
		.getService(Components.interfaces.mozIJSSubScriptLoader)
		.loadSubScript(uri);
}
include('chrome://dta/content/common/xpcom.jsm');

const NS_ERROR_NO_INTERFACE = Cr.NS_ERROR_NO_INTERFACE;
const NS_ERROR_FAILURE = Cr.NS_ERROR_FAILURE;
const NS_ERROR_NO_AGGREGATION = Cr.NS_ERROR_NO_AGGREGATION;
const NS_ERROR_INVALID_ARG = Cr.NS_ERROR_INVALID_ARG;

const ScriptableInputStream = new Components.Constructor('@mozilla.org/scriptableinputstream;1', 'nsIScriptableInputStream', 'init');

var ContentHandling = {
	_init: function() {
		var obs = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);
		obs.addObserver(this, 'http-on-modify-request', true);
	},
	observe: function(subject, topic, data) {
		if (
			!(subject instanceof Ci.nsIHttpChannel)
			|| !(subject instanceof Ci.nsIUploadChannel)
		) {
			return;
		}
		var channel = subject.QueryInterface(Ci.nsIHttpChannel);
		if (channel.requestMethod != 'POST') {
			return;
		}

		var post;
    
		try {
			var us = subject.QueryInterface(Ci.nsIUploadChannel).uploadStream;
			var ss = us.QueryInterface(Ci.nsISeekableStream);
			var op = ss.tell();
		
			ss.seek(0, 0);
			
			var is = new ScriptableInputStream(us);
			
			// we'll read max 64k
			var available = Math.min(is.available(), 1 << 16);
			if (available) {
				post = is.read(available);
			}
			ss.seek(op, 0);
			if (post) {
				this._registerData(channel.URI, post);
			}
		}
		catch (ex) {
			debug("cannot get post-data", ex);
		}
  },
  _dataDict: {},
  _dataArray: [],
  _registerData: function(uri, data) {
  	uri = uri.spec;

  	if (!(uri in this._dataDict)) {
  		if (this._dataArray.length > 5) {
  			delete this._dataDict[this._dataArray.pop()];
  		}
  		this._dataArray.push(uri);
  	}
  	
  	this._dataDict[uri] = data;  	
  },
  getPostDataFor: function(uri) {
  	if (uri instanceof Ci.nsIURI) {
  		uri = uri.spec;
  	}
  	if (!(uri in this._dataDict)) {
  		return '';
  	}
  	return this._dataDict[uri];
  }  	
};
implementComponent(
	ContentHandling,
	Components.ID("{47C53284-E2D1-49af-9524-4D42D70D1279}"),
	"@downthemall.net/contenthandling;1",
	"DownThemAll! Content Handling",
	[Ci.nsIObserver, Ci.nsiURIContentListener, Ci.dtaIContentHandling]
);	
ContentHandling._init();


// entrypoint
function NSGetModule(compMgr, fileSpec) {
	return new ServiceModule(ContentHandling, true);
}