/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const COMMON_ATOMS = ["iconic", "completed", "inprogress", "paused", "canceled", "pausedUndetermined", "pausedAutoretrying", "verified", "progress", "private"];

const _as = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);

function Atoms() {
	for (let i = 0; i < arguments.length; ++i) {
		this.getAtom(arguments[i]);
	}
}
Atoms.prototype = {
	getAtom: function(atom) this[atom] || (this[atom] = _as.getAtom(atom))
};
exports.Atoms = Atoms;

for (let atom of COMMON_ATOMS) {
	exports[atom + "Atom"] = _as.getAtom(atom);
}
Object.freeze(exports);
