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

const Cc = Components.classes;
const Ci = Components.interfaces;

/**
 * implemtents nsITreeView manages our link trees
 */
function Tree(links, type) {

	// type corresponding to dtaIFilterManager
	this._type = type;

	// internal list of links.
	// better make this a real array (links parameter is usually an object)
	this._links = links.map(
		function(link) {
			// "lazy initialize" the icons.
			// cache them so that we don't have to lookup them again and again.
			// but do not precompute them, as we don't know if we'll ever display
			// them.
			link.__defineGetter__(
				'icon',
				function() {
					if (!this._icon) {
						this._icon = getIcon(this.url.url.spec, 'metalink' in this);
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
			link.__defineGetter__(
				'resname',
				function() {
					if (!this._resname) {
						this._resname = this.url.usable.getUsableFileName();
					}
					return this._resname;
				}
			);

			// .checked will hold the correspoding 'property' string, either none,
			// manuallySelected, or f0-f8
			link.checked = '';
			link.mask = null;
			return link;
		}
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
	// we have a limited set of atoms anyway, so we don't have to expect a huge
	// cache.
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
		this._links.forEach(function(e) { if (e.checked.length){++checked;} });

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
			
			// check mark, sort compat
			case 0: return this.getCellValue(idx, col);
			
			// col 1 is the name
			case 1: return l.url.usable;

			// col 2 is the resname
			case 2: return l.resname;
			
			// col 3 is the description
			case 3: return l.desc;

			// col 4 is the renaming mask
			case 4: return l.mask ? l.mask : _('default');
		}
		return null;
	},

	isSorted: function() {
		return !!this._sortColumn;
	},
	isContainer: function(idx) {
		// being a container means we got children... but we don't have any children
		// because we're a list actually
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
		// didn't test the column index, as there is just one column that may call
		// it
		// BEWARE: other code in Dialog will call this function providing no column!
		return this._links[idx].checked.length ? "true" : "false";
	},

	// called when a header is called.
	// apply sorting here
	_sortColumn: null,
	_sortDirection: false,
	cycleHeader: function(col, elem) {
		if (col.index == this._sortColumn) {
			this._sortDirection = !this._sortDirection;
		}
		else {
			Debug.logString("setting sortColumn = " + col.index);
			this._sortColumn = col.index;
			this._sortDirection = false;
		}
		let sd;
		this._links.forEach(function(e, i) { e._sortId = i; });
		
		let tp = this;
		this._links = Utils.naturalSort(this._links, function(e) tp.getCellText(e._sortId, col));
		if (this._sortDirection) {
			this._links.reverse();
		}
		this.invalidate();
	},

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
		}
		else {
			l.checked = '';
			l.manuallySelected = false;
		}

		// a lil' hacky.
		// Dialog.toggleSelection will call us with a null column
		// makeSelection will invalidate the whole tree after it is done, so we
		// don't have to sacrifice performance here.
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
			if (!links.length) {
				$('viewlinks').disabled = true;
			}
			$("viewpics").label = $("viewpics").label + " ("+ images.length + ")";
			if (!images.length) {
				$('viewpics').disabled = true;
			}

			// intialize our Trees (nsITreeview)
			// type parameter corresponds to dtaIFilter types
			this.links = new Tree(links, 1);
			this.images = new Tree(images, 2);			

			// changeTab will initialize the filters and do the selection for us
			let preferredTab = Preferences.getExt("seltab", 0);
			if (preferredTab) {
				this.changeTab(!!images.length ? 'images' : 'links');
			}
			else {
				this.changeTab(!!links.length ? 'links': 'images');
			}

			$("urlList").addEventListener(
				'keypress',
				function(evt) {
					if (evt.charCode == ' '.charCodeAt(0)) {
						Dialog.toggleSelection();
					}
				},
				true
			);
			
		}
		catch(ex) {
			DTA_debug.log("load():", ex);
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
	download: function(start) {
		try {

			// not everything correctly set. refuse to start
			if (!this.check()) {
				return false;
			}

			var dir = this.ddDirectory.value;
			var mask = this.ddRenaming.value;
			var counter = Preferences.getExt("counter", 1);
			if (++counter > 999) {
				counter = 1;
			}
			
			function prepare(link, dir, counter, mask) {
				link.dirSave = dir;
				link.numIstance = counter;
				link.mask = link.mask ? link.mask : mask;
				return link;
			}

			// build the actual array holding all selected links
			var links = this.current._links;
			var out = [];
			for each (let i in links) {
				try {
					if (!i.checked.length) {
						continue;
					}
					out.push(prepare(i, dir, counter, mask));
				}
				catch (ex) {
					Debug.log("err: " + i.toSource(), ex);
				}
			}

			// nothing selected. cannot start
			if (!out.length) {
				return false;
			}

			// actually start the crap.
			DTA_AddingFunctions.sendToDown(start, out);

			// save history
			['ddDirectory', 'ddRenaming', 'ddFilter'].forEach(function (e) { Dialog[e].save(); });

			// save the counter, queued state
			Preferences.setExt("counter", counter);
			Preferences.setExt("lastqueued", !start);
			
			let boxen = this.boxen;
			for (let i = 0; i < boxen.length; ++i) {
				boxen[i].filter.active = boxen[i].checked;
			}
			DTA_FilterManager.save();

			// unload ourselves.
			return this.unload();
		}
		catch(ex) {
			Debug.log("Downloadfile:", ex);
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


	notify: function() {
		if (this.current) {
			this.makeSelection();
		}
	},
	// will be called initially and whenever something changed
	makeSelection: function() {
		let tree = this.current;
		let type = tree.type;

		// will keep track of used filter-props f0-f8
		let used = {};
		let idx = 0;
		let boxen = this.boxen;
		let filters = [];
		if (!$('disableothers').checked) {
			for (let i = 0, e = boxen.length; i < e; ++i) {
				let box = boxen[i];
				if (!box.checked) {
					continue;
				}
				filters.push(box.filter);
			}
		}
		let fast = null;
		try {
			if (this.ddFilter.value) {
				fast = DTA_FilterManager.getTmpFromString(this.ddFilter.value);
			}
		}
		catch (ex) {
			// no op
		}
		
		for each (let link in tree._links) {
			link.checked = '';
			if (link.manuallyChecked) {
				link.checked = 'manuallySelected';
				continue;
			}
			if (fast && (fast.match(link.url.usable) || fast.match(link.desc))) {
				link.checked = 'fastFiltered';
				continue;
			}
			filters.some(
				function(f) {
					if (!f.match(link.url.usable)) {
						return false;
					}
					let i;

					// see if we already assigned a prop to that filter.
					if (f.id in used) {
						i = used[f.id];
					}
					else {
						i = idx = (idx + 1) % 8;
						used[f.id] = i;
					}
					link.checked = 'f' + i;
					return true;
				},
				this
			);
		}

		// need to invalidate our tree so that it displays the selection
		tree.invalidate();
	},

	// called whenever a filter is en/disabled
	toggleBox: function(box) {

		// whoops, somebody called us that has no filter attached
		if (!('filter') in box) {
			Debug.logString("toggleBox: invalid element");
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
					// calling setCellValue with a null column will prevent the box from
					// invalidating
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
			Preferences.setExt('seltab', 0);
			$("viewlinks").setAttribute("selected", true);
			$("viewpics").setAttribute("selected", false);
		}
		else {
			Preferences.setExt('seltab', 1);
			$("viewlinks").setAttribute("selected", false);
			$("viewpics").setAttribute("selected", true);
		}

		let boxes = [];
		var e = DTA_FilterManager.enumAll();
		while (e.hasMoreElements()) {
			let f = e.getNext().QueryInterface(Ci.dtaIFilter);
			if (!(f.type & type)) {
				continue;
			}
			let checkbox = document.createElement("checkbox");
			checkbox.setAttribute("checked", f.active);
			checkbox.setAttribute("id", f.id);
			checkbox.setAttribute("label", f.label);
			checkbox.setAttribute("oncommand", "Dialog.toggleBox(this);");
			checkbox.filter = f;
			boxes.push(checkbox);
		}
		
		// clean all filterboxen
		let rows = $('checkcontainerrows');
		let cols = $('checkcontainercols');
		while (rows.hasChildNodes()) {
			rows.removeChild(rows.lastChild);
		}
		while (cols.hasChildNodes()) {
			cols.removeChild(cols.lastChild);
		}
		let count = boxes.length;
		for (let i = 0; i < 4; ++i) {
			cols.appendChild(document.createElement('column'));
			cols.lastChild.setAttribute('flex', '1');
		}
		
		let row = null;
		boxes.forEach(
			function(b, i) {
				if (i % 4 == 0) {
					row = document.createElement('row');
					row.setAttribute('pack', 'center');
					rows.appendChild(row);
				}
				row.appendChild(b);
			}
		);
		// update selection
		this.makeSelection();
	},

	// browse for a dest directory
	browseDir: function() {

		// get a new directory
		var newDir = Utils.askForDir(
			this.ddDirectory.value, // initialize dialog with the current directory
			_("validdestination")
		);
		// alright, we got something new, so lets set it.
		if (newDir) {
			this.ddDirectory.value = newDir;
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
			// it will create the filter boxen for us, and furthermore do another
			// selection
			this.changeTab(this.current.tab);
		}
	},
	// register ourselves
	// * filterManager
	registerObserver: function() {
		Preferences.makeObserver(this);
		try {
			var os = Cc["@mozilla.org/observer-service;1"]
				.getService(Ci.nsIObserverService);
			os.addObserver(this, 'DTA:filterschanged', true);
		}
		catch (ex) {
			Debug.log("cannot install filterManager observer!", ex);
			return false;
		}
		return true;
	}
};
