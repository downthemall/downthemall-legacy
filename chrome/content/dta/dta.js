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
 * The Original Code is downTHEMall.
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

if (!Cc) {
	const Cc = Components.classes;
}
if (!Ci) {
	const Ci = Components.interfaces;
}

var strbundle;

/**
 * implemtents nsITreeView
 * manages our link trees
 */
function Tree(links, type) {

	// type corresponding to dtaIFilterManager
	this._type = type;

	// internal list of links.
	// better make this a real array (links parameter is usually an object)
	this._links = [];
	for (x in links) {
		// step over the length prop
		if (x == 'length') {
			continue;
		}

		var link = links[x];

		//  "lazy initialize" the icons.
		// cache them so that we don't have to lookup them again and again.
		// but do not precompute them, as we don't know if we'll ever display them.
		link.__defineGetter__(
			'icon',
			function() {
				if (!this._icon) {
					this._icon = getIcon(this.url, 'metalink' in this);
				}
				return this._icon;
			}
		);

		// same here for description
		link.__defineGetter__(
			'desc',
			function() {
				if (!this._desc) {
					this._desc = "";
					if ("description" in this && this.description.length > 0) {
						this._desc += this.description;
					}
					if ("ultDescription" in this && this.ultDescription.length > 0) {
						this._desc += ((this._desc.length > 0) ? ' - ' : '') + this.ultDescription;
					}
				}
				return this._desc;
			}
		);

		// .checked will hold the correspoding 'property' string, either none, manuallySelected, or f0-f8
		link.checked = '';
		link.mask = null;

		// place metalinks top
		if ('metalink' in link) {
			this._links.unshift(link);
		} else {
			this._links.push(link);
		}
	}

	// atom cache. See getAtom
	this._atoms = {};
	this._iconic = this._as.getAtom('iconic');
}
Tree.prototype = {

	// will use it quite often.
	// 'properties' need to be an atom.
	_as: Cc["@mozilla.org/atom-service;1"]
		.getService(Ci.nsIAtomService),

	// get atoms, but provide caching.
	// we have a limited set of atoms anyway, so we don't have to expect a huge cache.
	getAtom: function(str) {
		if (!(str in this._atoms)) {
			this._atoms[str] = this._as.getAtom(str);
		}
		return this._atoms[str];
	},

	// getter only -> readonly
	get type() {
		return this._type;
	},

	// will invalidate the whole box and update the statusbar.
	invalidate: function() {
		if (this._box) {
			// invalidate specific cell(s)
			if (arguments && arguments.length) {
				for (var i = 0; i < arguments.length; ++i) {
					this._box.invalidateRow(arguments[i]);
				}
			}
			// invalidate whole box
			else {
				this._box.invalidate();
			}
		}

		// compute and set the checked count
		var checked = 0;
		this._links.forEach(function(e) { if (e.checked.length) ++checked; });

		if (checked) {
			$("status").label = strbundle.getFormattedString("selel", [checked, this.rowCount]);
		} else {
			$("status").label = strbundle.getString("status");
		}
	},

	/*
	 * actual nsITreeView follows
	 */
	get rowCount() {
		// quite easy.. we have a static list.
		return this._links.length;
	},

	// used to initialize nsITreeview and provide the corresponding treeBoxObject
	setTree: function(box) {
		this._box = box;
	},

	getParentIndex: function(idx) {
		// no parents, as we are actually a list
		return -1;
	},
	getLevel: function(idx) {
		// ... and being a list all nodes are on the same level
		return 0;
	},
	getCellText: function(idx, col) {

		// corresponding link
		var l = this._links[idx];

		switch (col.index) {
			// col 1 is the name
			case 1: return l.url.usable;

			// col 2 is the description
			case 2: return l.desc;

			// col 3 is the renaming mask
			case 3: return l.mask ? l.mask : strbundle.getString('default');
		}
		return null;
	},

	isSorted: function() {
		// not sorted
		return false;
	},
	isContainer: function(idx) {
		// being a container means we got children... but we don't have any children because we're a list actually
		return false;
	},
	isContainerOpen: function(idx) {
		return false;
	},
	isContainerEmpty: function(idx) {
		return false;
	},

	isSeparator: function(idx) {
		// no separators
		return false;
	},

	isEditable: function(idx) {
		// and nothing is editable
		return true;
	},

	// will grab the "icon" for a cell.
	getImageSrc: function(idx, col) {

		var l = this._links[idx];
		switch (col.index) {
			case 1: return l.icon;
		}
		return null;
	},

	// we don't provide any progressmeters
	getProgressMode : function(idx,column) {},

	// will be called for cells other than textcells
	getCellValue: function(idx, column) {
		// col 0 is the checkbox
		// didn't test the column index, as there is just one column that may call it
		// BEWARE: other code in Dialog will call this function providing no column!
		return this._links[idx].checked.length ? "true" : "false";
	},

	// called when a header is called.
	// would be the place to change sort mode. But we don't have any sorting.
	cycleHeader: function(col, elem) {},

	// just some stubs we need to provide anyway to provide a full nsITreeView
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getColumnProperties: function(column, element, prop) {},

	getRowProperties: function(idx, prop) {
		var l = this._links[idx];
		// AppendElement will just accept nsIAtom.
		// no documentation on devmo, xulplanet though :p
		prop.AppendElement(this.getAtom(l.checked));
	},
	getCellProperties: function(idx, column, prop) {
		// col 1 is our url... it should display the type icon
		// to better be able to style add a property.
		if (column.index == 1) {
			prop.AppendElement(this._iconic);
		}
	},

	// called when the user clicks our checkboxen
	setCellValue: function(idx, col, value) {

		// set new checked state.
		var l = this._links[idx];
		if (value == "true") {
			l.checked = "manuallySelected";
			l.manuallyChecked = true;
		} else {
			l.checked = '';
			l.manuallySelected = false;
		}

		// a lil' hacky.
		// Dialog.toggleSelection will call us with a null column
		// makeSelection will invalidate the whole tree after it is done, so we don't have to sacrifice performance here.
		// we still have to invalidate if it was a click by the user.
		if (col) {
			this.invalidate(idx);
		}
	}
};

// little helper dept.
// create a downloadElement as accepted by Manager
function downloadElement(url, dir, num, desc1, desc2, mask, refPage) {
	this.url = url;
	this.dirSave = dir;
	this.numIstance = num;
	this.description = desc1;
	this.ultDescription = desc2;
	this.refPage = refPage;
	this.mask = mask;
}

/**
 * Our real, kicks ass implementation of the UI
 */
var Dialog = {

	// will be called to initialize the dialog
	load: function DTA_load() {

		strbundle = $("strings");

		// no help available?
		$("dtaHelp").hidden = !("openHelp" in window);

		// check if we upgraded...
		// XXX: look for ways to make this not necessary anymore
		versionControl();

		// construct or dropdowns.
		this.ddFilter = new DTA_DropDown(
			"filter",
			"filter",
			"filteritems",
			[strbundle.getString("ddfilter"), "/(\\.mp3)$/", "/(\\.(html|htm|rtf|doc|pdf))$/", "http://www.website.com/subdir/*.*", "http://www.website.com/subdir/pre*.???", "*.z??, *.css, *.html"]
		);
		this.ddDirectory = new DTA_DropDown("directory", "directory", "directoryitems", "", "");
		this.ddRenaming = new DTA_DropDown(
			"renaming",
			"renaming",
			"renamingitems",
			["*name*.*ext*", "*num*_*name*.*ext*", "*url*-*name*.*ext*", "*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"]
		);

		try {
			// initialize or link lists
			var links = window.arguments[0];
			var images = window.arguments[1];

			// initialize the labels
			$("viewlinks").label = $("viewlinks").label + " ("+ links.length + ")";
			$("viewpics").label = $("viewpics").label + " ("+ images.length + ")";

			// intialize our Trees (nsITreeview)
			// type parameter corresponds to dtaIFilter types
			this.links = new Tree(links, 1);
			this.images = new Tree(images, 2);

			// additional filters anyone :p
			this.showFilter(this.ddFilter.current.length);

			// changeTab will initialize the filters and do the selection for us
			this.changeTab(Preferences.getDTA("seltab", 0) ? 'images': 'links');

		} catch(ex) {
			DTA_debug.dump("load():", ex);
		}

		// will install our observer
		// currently just observes dtaIFilterManager
		this.registerObserver();

	},

	// dialog destruction
	unload: function DTA_unload() {

		// save those filters (we can just modify 'active' props in this dialog)
		DTA_FilterManager.save();

		self.close();
	},

	// checks if we can continue to process
	check: function DTA_check() {

		var f = new filePicker();
		var dir = this.ddDirectory.current.trim();

		// directory and mask set?
		if (!dir.length || !this.ddRenaming.current.trim().length) {
			// XXX: Error message.
			return false;
		}

		// directory valid?
		if (!f.checkDirectory(dir))
		{
			alert(strbundle.getString("alertfolder"));
			var newDir = f.getFolder(null, strbundle.getString("validdestination"));
			this.ddDirectory.current = newDir ? newDir : '';
			return false;
		}
		return true;
	},

	// user decided to start the selection
	download: function(notQueue) {
		try {

			// not everything correctly set. refuse to start
			if (!this.check()) {
				return false;
			}

			var dir = this.ddDirectory.current;
			var mask = this.ddRenaming.current;
			var counter = Preferences.getDTA("counter", 1);
			if (++counter > 999) {
				counter = 1;
			}

			// build the actual array holding all selected links
			var links = this.current._links;
			var out = [];
			for (var i = 0; i < links.length; ++i) {
				var link = links[i];
				if (!link.checked.length) {
					continue;
				}
				out.push(
					new downloadElement(
						link.url,
						dir,
						counter,
						"description" in link ? link.description : "",
						"ultDescription" in link ? link.ultDescription : "",
						link.mask ? link.mask : mask,
						link.refPage
					)
				);
			}

			// nothing selected. cannot start
			if (!out.length) {
				return false;
			}

			// actually start the crap.
			DTA_AddingFunctions.sendToDown(notQueue, out);

			// save history
			['ddDirectory', 'ddRenaming', 'ddFilter'].forEach(function (e) { Dialog[e].save(); });

			// save the counter, queued state
			Preferences.setDTA("counter", counter);
			Preferences.setDTA("lastWasQueued", !notQueue);

			// unload ourselves.
			this.unload();
			return true;

		} catch(ex) {
			Debug.dump("Downloadfile:", ex);
		}

		// if we get here some error occured - just close.
		self.close();
		return false;
	},

	// edit the mask on a per item/selection basis
	editMask: function() {

		// whoops, nothing selected
		if (!this.current.selection.count) {
			return;
		}

		// display the renaming mask dialog
		var mask = {value: null};
		window.openDialog(
			"chrome://dta/content/dta/renamingmask.xul",
			"",
			"chrome, dialog, centerscreen, resizable=yes, dialog=no, modal, close=no",
			mask
		);

		// user hit cancel, or some error occured
		if (!mask.value) {
			return;
		}

		// set the new mask for each selected item
		const rangeCount = this.current.selection.getRangeCount();
		var start = {}, end = {};
		for (var r = 0; r < rangeCount; ++r) {
			this.current.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				this.current._links[i].mask = mask.value;
			}
		}

		// invalidate so the new values are displayed
		this.current.invalidate();
	},

	// will be called initially and whenever something changed
	makeSelection: function() {

		var tree = this.current;
		var type = tree.type;

		// see if there is an additional filter
		var additional = new DTA_AdditionalMatcher(this.ddFilter.current, $('regex').checked);

		// will keep track of used filter-props f0-f7
		var used = {};
		var idx = 0;

		for (var x = 0; x < tree._links.length; ++x) {

			var link = tree._links[x];

			var checked = '';
			if (link.manuallyChecked) {
				checked = 'manuallySelected';
			}
			else if (additional.match(link.url.url)) {
				checked = 'f8';
			}
			else {
				var e = DTA_FilterManager.enumActive(type);
				while (e.hasMoreElements()) {
					var f = e.getNext().QueryInterface(Ci.dtaIFilter);
					if (f.match(link.url.usable)) {
						var i;

						// see if we already assigned a prop to that filter.
						if (f.id in used) {
							i = used[f.id];
						}
						else {
							i = idx = (idx + 1) % 8;
							used[f.id] = i;
						}
						checked = 'f' + i;
						break;
					}
				}
			}

			link.checked = checked;
		}

		// need to invalidate our tree so that it displays the selection
		tree.invalidate();
	},

	// called whenever a filter is en/disabled
	toggleBox: function(box) {

		// whoops, somebody called us that has no filter attached
		if (!('filter') in box) {
			Debug.dump("toggleBox: invalid element");
			return;
		}

		// set the filter enabled/disabled
		// Note: this will NOT save the filter (to prefs)
		box.filter.active = box.checked;

		// alright, need to overthink our selection
		this.makeSelection();
	},

	// will check/uncheck/invert the currently selected links
	toggleSelection: function () {

		// modes: 1 = check, 2 = uncheck, other = invert
		var mode = 0;
		if (arguments && arguments.length) {
			mode = arguments[0] ? 1 : 2;
		}
		var tree = this.current;

		var rangeCount = tree.selection.getRangeCount();
		var start = {}, end = {}, val;
		for (var r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				switch (mode) {
					// calling setCellValue with a null column will prevent the box from invalidating
					// note, that
					case 1:
						tree.setCellValue(i, null, 'true');
					break;
					case 2:
						tree.setCellValue(i, null, 'false');
					break;
					default:
						val = tree.getCellValue(i);
						val = val == 'true' ? 'false' : 'true';
						tree.setCellValue(i, null, val);
					break;
				}
			}
		}

		// alright, like always our tree needs an update.
		tree.invalidate();
	},

	changeTab: function (tab) {
		// BEWARE: Other functions will call us to reinitalize the filters/selection

		// first of all: remember the currently selected/displayed tab
		this.current = this[tab];
		this.current.tab = tab;

		// ... and set it to the actual tree
		$("urlList").view = this.current;

		// ... and update the UI
		var type = this.current.type;
		if (type == 1) {
			Preferences.setDTA('seltab', 0);
			$("viewlinks").setAttribute("selected", true);
			$("viewpics").setAttribute("selected", false);
		}
		else {
			Preferences.setDTA('seltab', 1);
			$("viewlinks").setAttribute("selected", false);
			$("viewpics").setAttribute("selected", true);
		}

		// clean all filterboxen
		var box = $("checkcontainer");
		while (box.hasChildNodes()) {
			box.removeChild(box.lastChild);
		}

		// but add them again (doing so because we might have been called because dtaIFiltermanager propagated a change)
		var e = DTA_FilterManager.enumAll();
		while (e.hasMoreElements()) {
			var f = e.getNext().QueryInterface(Ci.dtaIFilter);
			if (!(f.type & type)) {
				continue;
			}
			var checkbox = document.createElement("checkbox");
			checkbox.setAttribute("checked", f.active);
			checkbox.setAttribute("id", f.id);
			checkbox.setAttribute("label", f.label);
			checkbox.setAttribute("class", "lista");
			checkbox.setAttribute("oncommand", "Dialog.toggleBox(this);");
			checkbox.filter = f;
			box.appendChild(checkbox);
		}

		// update selection
		this.makeSelection();
	},

	// expand/collpase additional filters box.
	showFilter: function() {

		var reg = $("regexbox");
		var add = $("additional");

		if (arguments.length == 0) {
			reg.collapsed = !(reg.collapsed);
		}
		else {
			reg.collapsed = !(arguments[0]);
		}

		if (reg.collapsed) {
			add.setAttribute("label", strbundle.getString("additional") + "...");
			add.setAttribute("class", "expand");
		} else {
			add.setAttribute("label", strbundle.getString("additional") + ":");
			add.setAttribute("class", "collapse");
		}
	},

	// browse for a dest directory
	browseDir: function() {

		// get a new directory
		var f = new filePicker();
		var newDir = f.getFolder(
			this.ddDirectory.current, // initialize dialog with the current directory
			strbundle.getString("validdestination")
		);
		// alright, we got something new, so lets set it.
		if (newDir) {
			this.ddDirectory.current = newDir;
		}
	},

	// initialized the popup
	showPopup: function() {

		var items = $('popup').getElementsByTagName('menuitem');
		var open = $('mopen');
		var tree = this.current;

		// do we have a selection
		if (!tree.selection.count) {
			// ... nope. do not display the menu.
			return false;
		}

		var s = {}, e = {};
		tree.selection.getRangeAt(0, s, e);
		var l = tree._links[s.value];
		open.setAttribute("image", l.icon);
		open.setAttribute("label", l.url.url);

		// display the popup
		return true;
	},
	
	// will open the curretly selected links in new tabs
	openSelection: function() {
		var tree = this.current;
		var rangeCount = tree.selection.getRangeCount();
		var start = {}, end = {}, val;
		for (var r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (var i = start.value; i <= end.value; ++i) {
				DTA_Mediator.openTab(tree._links[i].url.url, tree._links[i].refPage);
			}
		}
	},
	
	// nsiSupports::QueryInterface
	// currently we implement a weak observer
	QueryInterface: function(iid) {
		if (
			iid.equals(Ci.nsISupports)
			|| iid.equals(Ci.nsISupportsWeakReference)
			|| iid.equals(Ci.nsIWeakReference)
			|| iid.equals(Ci.nsiObserver)
		) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	},

	// nsiWeakReference::QueryReferent
	// for weak observer
	QueryReferent: function(iid) {
		return this;
	},

	// nsiSupportsWeakReference
	// for weak observer
	GetWeakReference: function() {
		return this;
	},

	// nsIObserver::observe
	observe : function(subject, topic, prefName) {
		// filterManager will throw this topic at us.
		if (topic == 'DTA:filterschanged') {
			// the heavy work will be performed by changeTab..
			// it will create the filter boxen for us, and furthermore do another selection
			this.changeTab(this.current.tab);
		}
	},

	// register ourselves
	// * filterManager
	registerObserver: function() {
		try {
			var os = Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService);
			os.addObserver(this, 'DTA:filterschanged', true);
		}
		catch (ex) {
			Debug.dump("cannot install filterManager observer!", ex);
			return false;
		}
		return true;
	}
};

DTA_include("chrome://dta/content/dta/maskbutton.js");