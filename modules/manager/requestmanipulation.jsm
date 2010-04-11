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

const EXPORTED_SYMBOLS = ['overrideUA'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const module = Cu.import;
const Exception = Components.Exception;

function Manipulator() {
	this._m = {};
}
Manipulator.prototype = {
	register: function(matcher, func) {
		this._m[matcher.toString()] = {
				matcher: matcher,
				func: func
		};	
	},
	unregister: function(matcher) {
		matcher = matcher.toString();
		if (matcher in this._m) {
			delete this._m[matcher];
		}
	},
	modify: function(context, spec) {
		for each (let m in this._m) {
			if (m.matcher.test(spec)) {
				try {
					m.func.apply(context);
				}
				catch (ex) {
					Cu.reportError(ex);
				}
			}
		}		
	}
}

for each (let [m, sp] in [['URL', function(c) c.spec], ['Http', function(c) c.URI.spec]]) {
	let _m = new Manipulator();
	let _sp = sp;
	this['register' + m] = function(matcher, func) _m.register(matcher, func);
	this['unregister' + m] = function(matcher) _m.unregister(matcher, func);
	this['modify' + m] = function(context) _m.modify(context, _sp(context));
	EXPORTED_SYMBOLS.splice(EXPORTED_SYMBOLS.length, 3, 'register' + m, 'unregister' + m, 'modify' + m);
}

function overrideUA() {
	this.setRequestHeader('User-Agent', 'DownThemAll!', false);
	this.setRequestHeader('Referer', '', false);
}

// Sourceforge
registerHttp(
	/(?:sf|sourceforge)\.net\/.*(?:\/files\/|use_mirror)/,
	overrideUA
);

// Rapidshare direct
registerURL(
	/^https?:\/\/(?:[\w\d_.-]+\.)?rapidshare\.com\/files\/[^?]*?(?!\?directstart=1)$/,
	function() this.spec += "?directstart=1"
);