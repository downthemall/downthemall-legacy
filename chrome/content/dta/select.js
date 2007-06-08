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

if (!Cc) {
	var Cc = Components.classes;
}
if (!Ci) {
	var Ci = Components.interfaces;
}

/**
 * implemtents nsITreeView
 * manages our link trees
 */
function Tree(links, type) {

	// type corresponding to dtaIFilterManager
	this._type = type;

	// internal list of links.
	// better make this a real array (links parameter is usually an object)
	this._links = links;
	this._links.forEach(
		function(link) {
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
		},
		this
	);

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
			$("status").label = _("selel", [checked, this.rowCount]);
		} else {
			$("status").label = _("status");
		}
	},
	isChecked: function(idx) {
		return this._links[idx].checked.length != 0;
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
			case 3: return l.mask ? l.mask : _('default');
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

/**
 * Our real, kicks ass implementation of the UI
 */
var Dialog = {
	
	get boxen() {
		return $('checkcontainer').getElementsByTagName('checkbox');
	},
	
	// will be called to initialize the dialog
	load: function DTA_load() {
	
		make_();

		// no help available?
		$("dtaHelp").hidden = !("openHelp" in window);

		// construct or dropdowns.
		this.ddFilter = $('filter');
		this.ddDirectory = $('directory');
		this.ddRenaming = $('renaming');

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

			// changeTab will initialize the filters and do the selection for us
			this.changeTab(Preferences.getDTA("seltab", 0) ? 'images': 'links');

			$("urlList").addEventListener(
				'keypress',
				function(evt) {
					if (evt.charCode == ' '.charCodeAt(0)) {
						Dialog.toggleSelection();
					}
				},
				true
			);
			
		} catch(ex) {
			DTA_debug.dump("load():", ex);
		}

		// will install our observer
		// currently just observes dtaIFilterManager
		this.registerObserver();

	},

	// dialog destruction
	unload: function DTA_unload() {
		self.close();
		return true;
	},

	// checks if we can continue to process
	check: function DTA_check() {
		var dir = this.ddDirectory.value.trim();

		// directory and mask set?
		if (!dir.length || !this.ddRenaming.value.trim().length) {
			alert(_('alertinfo'));
			return false;
		}

		// directory valid?
		if (!Utils.validateDir(dir))	{
			alert(_("alertfolder"));
			var newDir = Utils.askForDir(null, _("validdestination"));
			this.ddDirectory.value = newDir ? newDir : '';
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

			var dir = this.ddDirectory.value;
			var mask = this.ddRenaming.value;
			var counter = Preferences.getDTA("counter", 1);
			if (++counter > 999) {
				counter = 1;
			}
			
			function prepare(link, dir, counter, mask) {
				link.dirSave = dir;
				link.numIstance = counter;
				link.mask = link.mask ? link.mask : mask;
				return link
			}

			// build the actual array holding all selected links
			var links = this.current._links;
			var out = [];
			for (var i = 0; i < links.length; ++i) {
				var link = links[i];
				if (!link.checked.length) {
					continue;
				}
				out.push(prepare(link, dir, counter, mask));
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
			Preferences.setDTA("lastqueued", !notQueue);
			
			var boxen = this.boxen;
			for (var i = 0; i < boxen.length; ++i) {
				boxen[i].filter.active = boxen[i].checked;
			}
			DTA_FilterManager.save();

			// unload ourselves.
			return this.unload();
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
		var additional = new DTA_AdditionalMatcher(this.ddFilter.value, $('regex').checked);

		// will keep track of used filter-props f0-f7
		var used = {};
		var idx = 0;
		var boxen = this.boxen;
		var filters = [];
		for (var i = 0; i < boxen.length; ++i) {
			if (!boxen[i].checked) {
				continue;
			}
			filters.push(boxen[i].filter);
		}

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
				filters.some(
					function(f) {
						if (!f.match(link.url.usable)) {
							return false;
						}
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
						return true;
					},
					this
				);
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

	// browse for a dest directory
	browseDir: function() {

		// get a new directory
		var newDir = Utils.askForDir(
			this.ddDirectory.current, // initialize dialog with the current directory
			_("validdestination")
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
		
		const hideItems = tree.selection.count == 0;
		$('mopen', 'mcheck', 'muncheck', 'mtoggle', 'mrenaming', 'msep1', 'msep2', 'msep3').forEach(
			function(e) {
				e.setAttribute('hidden', hideItems);
			}
		);
		
		var otext = '';
		if (tree.selection.count == 1) {
			var s = {}, e = {};
			tree.selection.getRangeAt(0, s, e);
			var l = tree._links[s.value];
			otext = _("openlink", [l.url.url]);
		}
		else {
			otext = _("openlinks", [tree.selection.count]);
		}
		open.setAttribute("label", otext);
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
				DTA_Mediator.openTab(tree._links[i].url.url, tree._links[i].referrer);
			}
		}
	},
	
	selectAll: function() {
		this.current.selection.selectAll();
	},
	invertSelection: function() {
		// this.current.selection.invertSelection();
		// not implemented :p
		var tree = this.current;
		var selection = tree.selection;
		for (var i = 0, e = tree.rowCount; i < e; ++i) {
			selection.toggleSelect(i);
		}		
	},
	selectFiltered: function() {
		var tree = this.current;
		var selection = tree.selection;
		selection.clearSelection();
		for (var i = 0, e = tree.rowCount; i < e; ++i) {
			if (tree.isChecked(i)) {
				selection.rangedSelect(i, i, true);
			}
		}
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
		makeObserver(this);
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
