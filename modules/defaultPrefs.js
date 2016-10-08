"use strict";

/* global pref */
pref("extensions.dta.ctxmenu", "1,1,0");
pref("extensions.dta.ctxcompact", false);
pref("extensions.dta.toolsmenu", "0,0,0");
pref("extensions.dta.toolshidden", false);
pref("extensions.dta.closedta", false);
pref("extensions.dta.saveTemp", false);
pref("extensions.dta.downloadWin", true);
pref("extensions.dta.conflictresolution", 3);
pref("extensions.dta.ntask", 8);
pref("extensions.dta.timeout", 300);
pref("extensions.dta.maxchunks", 4);
pref("extensions.dta.history", 5);
pref("extensions.dta.alertbox", 2);
pref("extensions.dta.removecompleted", true);
pref("extensions.dta.removecanceled", false);
pref("extensions.dta.removeaborted", false);
pref("extensions.dta.infophrases", true);
pref("extensions.dta.statistics", false); // later use!
pref("extensions.dta.logging", false);
pref("extensions.dta.showonlyfilenames", true);
pref("extensions.dta.sounds.done", true);
pref("extensions.dta.sounds.error", false);
pref("extensions.dta.settime", true);
pref("extensions.dta.showtooltip", true);
pref("extensions.dta.renaming.default", JSON.stringify([
	"*name*.*ext*", "*num*_*name*.*ext*", "*url*-*name*.*ext*",
	"*name* (*text*).*ext*", "*name* (*hh*-*mm*).*ext*"
	]));
pref("extensions.dta.filter.default", JSON.stringify([
	"", "/\\.mp3$/", "/\\.(html|htm|rtf|doc|pdf)$/",
	"http://www.website.com/subdir/*.*",
	"http://www.website.com/subdir/pre*.???",
	"*.z??, *.css, *.html"
	]));
pref("extensions.dta.lastqueued", false);
pref("extensions.dta.lastalltabs", false);
pref("extensions.dta.rememberoneclick", false);
pref("extensions.dta.autoretryinterval", 300);
pref("extensions.dta.maxautoretries", 5);
pref("extensions.dta.autoclearcomplete", false);
pref("extensions.dta.confirmcancel", true);
pref("extensions.dta.confirmremove", true);
pref("extensions.dta.confirmremovecompleted", true);
pref("extensions.dta.permissions", 416);
pref("extensions.dta.loadendfirst", 0);
pref("extensions.dta.loadendfirst", 0);
pref("extensions.dta.startminimized", false);
pref("extensions.dta.flatreplacementchar", "-");
pref("extensions.dta.recoverallhttperrors", false);
pref("extensions.dta.selectbgimages", false);
pref("extensions.dta.nagnever", false);
pref("extensions.dta.nagnext", 500);
pref("extensions.dta.speedlimit", -1);
pref("extensions.dta.listsniffedvideos", false);
pref("extensions.dta.nokeepalive", true);
pref("extensions.dta.resumeonerror", false);
pref("extensions.dta.textlinks", true);
pref("extensions.dta.serverlimit.perserver", 4);
pref("extensions.dta.serverlimit.connectionscheduler", 'fast');
pref("extensions.dta.exposeInUA", false);
pref("extensions.dta.sparsefiles", false);
pref("extensions.dta.autosegments", true);
pref("extensions.dta.notification2", 2);
pref("extensions.dta.usesysalerts", false);
pref("extensions.dta.seriesdigits", 3);
pref("extensions.dta.usecleanrequests", false);
pref("extensions.dta.showactions", true);

// Non-customizable-toolbar specific
pref("extensions.dta.tb.buttons", "1,1,0");

/**
 * Schedule
 */
pref("extensions.dta.schedule.enabled", false);
pref("extensions.dta.schedule.start", 0);
pref("extensions.dta.schedule.end", 1380); // 23:00
pref("extensions.dta.schedule.open", true);

/**
 * Privacy Controls
 */
pref("privacy.cpd.extensions-dta", false);
pref("privacy.clearOnShutdown.extensions-dta", false);

pref("extensions.mintrayr.downthemall.watchmanager", false);
