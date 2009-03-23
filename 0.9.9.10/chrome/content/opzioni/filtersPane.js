/* ***** BEGIN LICENSE BLOCK *****
 * Version: GPL 2.0
 *
 * This code is part of DownThemAll! - dTa!
 * Copyright © 2004-2006 Federico Parodi and Stefano Verna.
 * 
 * See notice.txt and gpl.txt for details.
 *
 * Contributers:
 *   Nils Maier <MaierMan@web.de>
 *
 * ***** END LICENSE BLOCK ***** */
 
var lastPreference = -1; // tiene traccia del valore più alto dei filtri in pref.js
var lastNumber = -1;
var strb = document.getElementById("stringB");


function load() { try {

	var numFilters = nsPreferences.getIntPref("extensions.dta.context.numfilters",0);
	
	// if we haven't any filters saved, load default and go on
	if (numFilters == 0) {defaultFilters();numFilters=defNumFilters;}
	validList();
	for ( var i = 0; i < numFilters; i++ ) {
		
		// carica le preferenze
		addFilterPreference(i,-1);
		
		// genera il contenuto dell'albero
		addItemToList(i);
		
		// memorizzo in lastnumber il numero della preferenza più alta: in seguito la numerazione ripartirà da qua,
		// anche in caso di cancellazioni
		lastNumber = i;
		  
	}
	
	lastPreference = -1;
	disableWriting();
	} catch(e) {Debug.dump("load(): ", e);}
}

// Crea il set delle 4 preferenze che caratterizzano un filtro e lo aggiunge allo xul (con crea vero, crea un nuovo filtro, con falso carica il primo filtro disponibile)

function addFilterPreference(i, preferenceIndex) { 
	
		if (preferenceIndex == -1) {
			preferenceIndex = i;
		}
			   
		var prefCaption = document.createElement('preference');
		prefCaption.setAttribute ("id", "dtaFilter" + i + "caption");
		prefCaption.setAttribute ("name", "extensions.dta.context.filter"+ preferenceIndex +".caption");
		prefCaption.setAttribute ("type", "unichar");
		
		var prefs = document.getElementById("dinPref");
		prefs.appendChild(prefCaption);
		
		var prefFilter = document.createElement('preference');
		prefFilter.setAttribute ("id", "dtaFilter" + i + "filter");
		prefFilter.setAttribute ("name", "extensions.dta.context.filter"+ preferenceIndex +".filter");
		prefFilter.setAttribute ("type", "unichar");

		prefs.appendChild(prefFilter);
		
		var prefImage = document.createElement('preference');
		prefImage.setAttribute ("id", "dtaFilter" + i + "image");
		prefImage.setAttribute ("name", "extensions.dta.context.filter"+ preferenceIndex +".isImageFilter");
		prefImage.setAttribute ("type", "bool");

		prefs.appendChild(prefImage);
		
		var prefLink = document.createElement('preference');
		prefLink.setAttribute ("id", "dtaFilter" + i + "link");
		prefLink.setAttribute ("name", "extensions.dta.context.filter"+ preferenceIndex +".isLinkFilter");
		prefLink.setAttribute ("type", "bool");
		
		prefs.appendChild(prefLink);
		
		var prefChecked = document.createElement('preference');
		prefChecked.setAttribute ("id", "dtaFilter" + i + "checked");
		prefChecked.setAttribute ("name", "extensions.dta.context.filter"+ preferenceIndex +".checked");
		prefChecked.setAttribute ("type", "bool");

		prefs.appendChild(prefChecked);
			
}

// aggiunge l'elemento all'albero e lo seleziona
function addItemToList(i) { 
	try {
		var test = document.getElementById("dtaFilter"+ i +"caption");
		var listbox = document.getElementById("listafile");
		var child1 = document.createElement('treecell');
		child1.setAttribute('label',document.getElementById("dtaFilter"+ i +"caption").value);
		var child2 = document.createElement('treecell');
		child2.setAttribute('label',document.getElementById("dtaFilter"+ i +"filter").value);
		child1.setAttribute('id', "cap" + (i));
		child2.setAttribute('id', "ext" + (i));
		
		var TRow = document.createElement('treerow');
		Debug.dump("creato elemento" + i);
		TRow.appendChild(child1);
		TRow.appendChild(child2);
		var item = document.createElement('treeitem');
		item.setAttribute('id', "row" + i);
		item.appendChild(TRow);
		listbox.appendChild(item);
		Debug.dump("aggiunto elemento" + i);
		done = true;
		
		document.getElementById("filterTree").currentIndex = i;
		
	} 
	catch (e) {
		Debug.dump("additemtolist(): ", e);
	}
		
} 

// crea un nuovo filtro da zero: senza parametri assegna quelli di default
function addNewFilter(filterName,filterDefinition,isChecked,isLink,isImage) { try{
	
	var i = ++lastNumber;
	addFilterPreference(i,nsPreferences.getIntPref("extensions.dta.context.numfilters",0));
	addDefaultValues(i,filterName,filterDefinition,isChecked,isLink,isImage);
	addItemToList(i);
	nsPreferences.setIntPref("extensions.dta.context.numfilters",nsPreferences.getIntPref("extensions.dta.context.numfilters",0)+1);
	enableWriting();
	document.getElementById("filterTree").view.selection.select(nsPreferences.getIntPref("extensions.dta.context.numfilters",0)-1);
	window.sizeToContent();
	} catch (e) {Debug.dump("addNewFilter(): ", e);}
	
}

// quando seleziono un elemento del tree, aggiorno i text e checkbox con i dati relativi al filtro selezionato
function changeSelection() { try {
	var captionR = document.getElementById("captionRow");
	var oldTextCaption =  document.getElementById("captionA"); 
	enableWriting();
	
	var treeValue = document.getElementById("filterTree").currentIndex;
	if (treeValue < 0) {
		return;
	}

	var theValue = document.getElementById("filterTree").view.getItemAtIndex(treeValue).id.split("row")[1];
	captionR.removeChild(oldTextCaption);

	var textCaption = document.createElement('textbox');
	textCaption.setAttribute ("id", "captionA");
	textCaption.setAttribute ("preference", "dtaFilter" + theValue + "caption");
	textCaption.setAttribute ("value", document.getElementById("dtaFilter" + theValue + "caption").value);
	textCaption.setAttribute ("onblur", "changeCaption();");
		
	captionR.appendChild(textCaption);
	
	var filterR = document.getElementById("filterRow");
	var oldFilter = document.getElementById("filterA"); 
	filterR.removeChild(oldFilter);
	filterR.removeChild(document.getElementById("regex"));
   	
	var textFilter = document.createElement('textbox');
	textFilter.setAttribute ("id", "filterA");
	textFilter.setAttribute ("preference", "dtaFilter" + theValue + "filter");
	textFilter.setAttribute ("value", document.getElementById("dtaFilter" + theValue + "filter").value);
	textFilter.setAttribute ("onblur", "changeExt();");
		
		
	filterR.appendChild(textFilter);
		
	var newRegex = document.createElement('checkbox');
	newRegex.setAttribute ("id", "regex");
	newRegex.setAttribute ("label", strb.getString("regex"));
	newRegex.setAttribute ("oncommand", "makeRegex();");
	filterR.appendChild(newRegex);
	
	var linkR = document.getElementById("linkPicRow");
	var oldLink = document.getElementById("linksf"); 
	var oldPic = document.getElementById("imagesf");
	
	linkR.removeChild(oldLink);
	linkR.removeChild(oldPic);
   	
	var chkLnk = document.createElement('checkbox');
	var chkImg = document.createElement('checkbox');
	chkLnk.setAttribute ("id", "linksf");
	chkLnk.setAttribute ("preference", "dtaFilter" + theValue + "link");
	chkLnk.setAttribute ("checked", document.getElementById("dtaFilter" + theValue + "link").value);
	chkLnk.setAttribute ("label", strb.getString("links"));

	chkImg.setAttribute ("id", "imagesf");
	chkImg.setAttribute ("preference", "dtaFilter" + theValue + "image");
	chkImg.setAttribute ("checked", document.getElementById("dtaFilter" + theValue + "image").value);
	chkImg.setAttribute ("label", strb.getString("limages"));

	linkR.appendChild(chkLnk);
	linkR.appendChild(chkImg);
	
	//window.sizeToContent();
	
	isRegex();
	

	} catch (e) {Debug.dump("changeSelection() :", e);}
}

// imposta i valori specificati (o in assenza quelli di default) alla preferenza i
function addDefaultValues(i,filterName,filterDefinition,isChecked,isLink,isImage) {
	
	if (filterName == null) document.getElementById("dtaFilter"+i+"caption").value = strb.getString("newfilt");
	else document.getElementById("dtaFilter"+i+"caption").value = filterName;
	
	if (filterDefinition == null) document.getElementById("dtaFilter"+i+"filter").value = strb.getString("inserthere");
	else document.getElementById("dtaFilter"+i+"filter").value = filterDefinition;
	
	if (isChecked == null) document.getElementById("dtaFilter"+i+"checked").value = false;
	else document.getElementById("dtaFilter"+i+"checked").value = isChecked;
	
	if (isLink == null) document.getElementById("dtaFilter"+i+"link").value = true;
	else document.getElementById("dtaFilter"+i+"link").value = isLink;
	
	if (isImage == null) document.getElementById("dtaFilter"+i+"image").value = false;
	else document.getElementById("dtaFilter"+i+"image").value = isImage;
}

// elimina il filtro selezionato o specificato
function deleteFilter(i) { try {
	if (i < 0) {
		i = document.getElementById("filterTree").currentIndex;
	}
	if (i < 0) {
		return;
	}
	
	var theValue = document.getElementById("filterTree").view.getItemAtIndex(i).id.split("row")[1];
	var treeChild = document.getElementById("listaFile");
	// ricavo i nomi delle 4 preferenze da cancellare
	// ora però faccio cadere l'uguaglianza tra numero della preference e numero del filtro
	
	var delendumFilter = document.getElementById("dtaFilter"+ theValue +"filter").name.split(".")[3]; // otterò "filterN"
	
	// pulisco textboxes e checkboxes
	document.getElementById("captionA").setAttribute("value", "");
	document.getElementById("filterA").setAttribute("value", "");
	document.getElementById("regex").setAttribute("checked", false);
	document.getElementById("linksf").setAttribute("checked", false);
	document.getElementById("imagesf").setAttribute("checked", false);
	
	// rimuovo le preferenze da pref.js
	Preferences._pref.deleteBranch("extensions.dta.context." + delendumFilter);
		
	// rimuovo le voci di preference
	var prefs = document.getElementById("dinPref");
	prefs.removeChild(document.getElementById("dtaFilter" + theValue + "caption"));
	prefs.removeChild(document.getElementById("dtaFilter" + theValue + "filter"));
	prefs.removeChild(document.getElementById("dtaFilter" + theValue + "image"));
	prefs.removeChild(document.getElementById("dtaFilter" + theValue + "link"));
	prefs.removeChild(document.getElementById("dtaFilter" + theValue + "checked"));
	// decremento il numero di filtri con ns preferences (in modo da esser certo che lo cambi immediatamente)
	nsPreferences.setIntPref("extensions.dta.context.numfilters", nsPreferences.getIntPref("extensions.dta.context.numfilters",0)-1);
	
	// elimino la voce in tree
	var treeChild = document.getElementById("listafile");
	treeChild.removeChild(document.getElementById("row" + theValue));
	
	disableWriting();
	document.getElementById("filterTree").currentIndex = -1;
	var numStart = parseInt(delendumFilter.substring(7,delendumFilter.length-1));
	fixFilterList(numStart);
	
	} catch (e) { Debug.dump("deleteFilter() :", e);}
	
}

// cambia la caption del filtro nell'albero, al cambiamento della relativa textbox
function changeCaption() {
	try {
		var i = document.getElementById("filterTree").currentIndex;
		if (i < 0) {
			return -1;
		}
		var theValue = document.getElementById("filterTree").view.getItemAtIndex(i).id.split("row")[1];
		document.getElementById("cap" + theValue).setAttribute('label', document.getElementById("dtaFilter" + theValue + "caption").value);
	
	} catch(e) {Debug.dump("changeCaption(): ", e);}
	
	return 0;
}

// cambia il contenuto del filtro nell'albero, al cambiamento della relativa textbox
function changeExt() {
	try {
		var i = document.getElementById("filterTree").currentIndex;
		if (i < 0) {
			return -1;
		}
		var theValue = document.getElementById("filterTree").view.getItemAtIndex(i).id.split("row")[1];
		document.getElementById("ext" + theValue).setAttribute('label', document.getElementById("dtaFilter" + theValue + "filter").value);
		isRegex();
	} catch(e) {Debug.dump("changeExt(): ", e);}
	return 0;
}

// elimina tutti i filtri e imposta quelli di default
function resetFilters() {
	
	if (confirm(strb.getString("confirmfiltersreset"))) {
		var numFilter = document.getElementById("filterTree").view.rowCount-1;
		for (var i = numFilter; i > -1; i--) {
			deleteFilter(i);
		}
		
		defaultFilters();
		window.close();
	}
}

// imposta il filtro attutale come regex
function makeRegex() {
	
	var i = document.getElementById("filterTree").currentIndex;
	if (i < 0) return -1;

	var filter = document.getElementById("filterA");
	
	if (document.getElementById("regex").checked) {
		if (filter.value.substring(0,1) != "/") {
			filter.value = "/" + filter.value;
		}
		if (filter.value.substr(filter.value.length - 1, 1) != "/")
		{
			filter.value = filter.value + "/";
		}
	} else {
		if (filter.value.substring(0,1) == "/") {
			filter.value = filter.value.substring(1, filter.value.length);
		}
		if (filter.value.substr(filter.value.length - 1, 1) == "/")	{
			filter.value = filter.value.substring(0, filter.value.length -1);
		}
	}
	var theValue = document.getElementById("filterTree").view.getItemAtIndex(i).id.split("row")[1];
	document.getElementById("dtaFilter" + theValue + "filter").value = filter.value;
	changeExt();
	
	return 0;
}

// verifica se il filtro selezionato è uan regEx
function isRegex() {
	var filtro = document.getElementById("filterA");
	if ((filtro.value.substring(0,1) == "/") && (filtro.value.substr(filtro.value.length - 1, 1) == "/")) document.getElementById("regex").checked = true;
}

// disabilita i text e checkbox
function disableWriting() {
	document.getElementById("captionA").setAttribute('readonly', true);
	document.getElementById("filterA").setAttribute('readonly', true);
	document.getElementById("regex").setAttribute('disabled', true);
	document.getElementById("linksf").setAttribute('disabled', true);
	document.getElementById("imagesf").setAttribute('disabled', true);
	document.getElementById("removebutton").setAttribute('disabled', true);
}

function enableWriting() {
	document.getElementById("captionA").setAttribute('readonly', false);
	document.getElementById("filterA").setAttribute('readonly', false);
	document.getElementById("regex").setAttribute('disabled', false);
	document.getElementById("linksf").setAttribute('disabled', false);
	document.getElementById("imagesf").setAttribute('disabled', false);
	document.getElementById("removebutton").setAttribute('disabled', false);
}
