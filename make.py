#!/usr/bin/env python3
""" Build a DownThemAll! xpi"""

# pylint: disable=too-few-public-methods,broad-except,invalid-name,missing-docstring

import os
import re
import sys

from fnmatch import fnmatch
from functools import wraps
from glob import glob
from io import BytesIO
from argparse import ArgumentParser
from time import strftime
from warnings import warn
from xml.dom.minidom import parseString as XML
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED


NS_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
NS_EM = "http://www.mozilla.org/2004/em-rdf#"

RELEASE_ID = "{DDC359D1-844A-42a7-9AA1-88A850A938A8}"

FILES = (
    "install.rdf",
    "icon*.png",
    "bootstrap.js",
    "MPL", "GPL", "LGPL", "LICENSE",
    "chrome.manifest",
    "chrome/content/about/about.xul",
    "chrome/content/common/",
    "chrome/content/dta/",
    "chrome/content/integration/",
    "chrome/content/preferences/",
    "chrome/content/privacy/",
    "chrome/content/mac/",
    "chrome/content/unix/",
    "chrome/content/win/",
    "chrome/public/",
    "chrome/skin/",
    "chrome/locale/*/",
    "modules/*.js*",
    "modules/loaders/",
    "modules/manager/",
    "modules/support/",
    "modules/thirdparty/",
    )

TESTS = (
    "modules/tests/",
    "tests",
    )

EXCLUDED = (
    "chrome/locale/*/landingpage.dtd",
    "chrome/locale/*/description.properties",
    )

PLAIN = (
    "*.png",
    "*.jpg",
    "*.gif",
    )


try:
    from xpisign.context import ZipFileMinorCompression as _Minor

    class Minor(_Minor):
        """ Compatiblity stub"""

        @property
        def compat(self):
            """Only a compat layer"""
            return False

except ImportError:
    warn("No optimal compression available")

    class Minor(object):
        """ Compatiblity stub"""

        def __init__(self, *args):
            pass

        def __enter__(self):
            pass

        def __exit__(self, *args):
            pass

        @property
        def compat(self):
            """Only a compat layer"""
            return True

try:
    from Mozilla.CompareLocales import compareDirs as compare_locales
except ImportError:
    warn("CompareLocales is not available!")
    compare_locales = None


class Reset(object):
    """
    Reset the tracked file-like object stream position when done
    """

    def __init__(self, filep):
        self.filep = filep
        self.position = 0

    def __enter__(self):
        self.position = self.filep.tell()

    def __exit__(self, *args):
        self.filep.seek(self.position, 0)


class WorkingDirectory(object):
    """
    Change the working directory to make.py's path and restore when done
    """

    def __init__(self):
        self.workdir = "."

    def __enter__(self):
        self.workdir = os.getcwd()
        try:
            os.chdir(os.path.split(__file__)[0])
        except Exception:
            pass

    def __exit__(self, *args):
        os.chdir(self.workdir)

    @staticmethod
    def change(func):
        """
        Decorator: Change the working directory before calling wrapped
        function.
        """

        @wraps(func)
        def wrapper(*args, **kw):
            """ Automatic changing of working directory"""
            with WorkingDirectory():
                return func(*args, **kw)
        return wrapper


@WorkingDirectory.change
def check_locales(errors_only=False):
    """
    Checks all chrome.manifest listed locales are complete and without errors.
    """

    if not compare_locales:
        return
    listed = dict()
    with open("chrome.manifest", "r", encoding="utf-8") as manip:
        expr = re.compile(r"^locale\s+.+?\s+(.+?)\s+(.+?)\s*$")
        for line in manip:
            match = expr.match(line)
            if not match:
                continue
            locale, loc = match.groups()
            listed[locale] = loc

    if not listed:
        raise ValueError("did not read any locales")

    if len(listed) == 1:
        return

    for locale in ("en-US", "en", "de", "fr"):
        baseloc = listed.pop(locale, None)
        if baseloc:
            break
    else:
        raise ValueError("failed to determine base locale")

    for locale, locpath in listed.items():
        if not os.path.isdir(locpath):
            raise ValueError("Listed locale not available {}".format(locale))

        res = compare_locales(baseloc, locpath)
        summary = res.getSummary()[None]
        if "errors" in summary or (not errors_only and "missing" in summary):
            raise ValueError("{}: {}\n{}".format(locale, summary, res.details))


def filesort(file):
    """
    Package file sort keys
    """

    if file in ("install.rdf",):
        return 0, file
    if file in ("bootstrap.js", "chrome.manifest"):
        return 1, file
    if fnmatch(file, "icon*.png"):
        return 2, file
    if fnmatch(file, "modules/*"):
        return 3, file
    if file in ("MPL", "GPL", "LGPL", "LICENSE"):
        return 1000, file
    return 500, file


def files(*args, **kw):
    """
    Generator over all file listing the given patterns.
    All arguments will be considered patterns.

    excluded keyword arg may specify a list of patterns that won't be returned
    """

    excluded = kw.pop("excluded", ())

    def items(file):
        """Enumerate files"""
        if os.path.isdir(file):
            if not file.endswith("/"):
                file += "/"
            for i in files(file + "*"):
                yield i
        elif os.path.isfile(file) and \
                not any(fnmatch(file, x) for x in excluded):
            yield file.replace("\\", "/")

    for p in args:
        gg = glob(p)
        if not gg:
            raise ValueError("{} did not match anything!".format(p))
        for g in gg:
            for i in items(g):
                yield i


def releaseversionjs(fp, **kw):
    """ Preprocess version.js in release mode """
    kw = kw
    io = BytesIO()
    with Reset(io):
        for l in fp:
            if b"const ID = " in l:
                io.write(('const ID = "{}";\n'.format(RELEASE_ID)).encode("utf-8"))
            else:
                io.write(l)
    return io


def droptests(fp, **kw):
    """ Drop tests from chrome.manifest """
    kw = kw
    io = BytesIO()
    with Reset(io):
        for l in fp:
            if b"dta-tests" in l:
                continue
            io.write(l)
    return io


def localize(fp, **kw):
    """ Generate em:localized """
    kw = kw

    def sort(f):
        if "en-US" in f["locale"]:
            return 0, f["locale"]
        return 1, f["locale"]

    def get_locale_strings():
        locales = list()
        for f in sorted(files("chrome/locale/*/description.properties")):
            locale = dict(locale=(f.split("/", 3)[2],))
            with open(f, "r", encoding="utf-8") as lp:
                for l in lp:
                    l = l.strip()
                    if not l or l.startswith("#"):
                        continue
                    k, v = l.split("=", 1)
                    k = k.split(".")
                    k = k[-2] if len(k[-1]) < 3 else k[-1]
                    if not k or not v:
                        continue
                    if k not in locale:
                        locale[k] = list()
                    locale[k] += v,
            locales += locale,
        return locales

    locales = get_locale_strings()

    with Reset(fp):
        rdf = XML(fp.read())

    # kill old localized
    for e in rdf.getElementsByTagNameNS(NS_EM, "localized"):
        e.parentNode.removeChild(e)

    def mapkey(k):
        v = list()
        for e in rdf.getElementsByTagNameNS(NS_EM, k):
            v += e.firstChild.data,
        return k, v

    keys = ("locale", "name", "description", "creator", "homepageURL",
            "developer", "translator", "contributor")
    baseprops = dict(mapkey(k) for k in keys)

    def add_props():
        parent = rdf.getElementsByTagNameNS(NS_EM, "id")[0].parentNode
        for props in sorted(locales, key=sort):
            node = rdf.createElementNS(NS_EM, "em:localized")
            desc = rdf.createElementNS(NS_RDF, "Description")
            for k in keys:
                vals = props.get(k, baseprops.get(k, list()))
                for v in vals:
                    n = rdf.createElementNS(NS_EM, "em:" + k)
                    n.appendChild(rdf.createTextNode(v))
                    desc.appendChild(n)
            parent.appendChild(rdf.createTextNode("\n\t\t"))
            node.appendChild(desc)
            parent.appendChild(node)
        parent.appendChild(rdf.createTextNode("\n\t"))

    add_props()

    io = BytesIO()
    with Reset(io):
        io.write(rdf.toxml(encoding="utf-8"))
        rdf.unlink()
    return io


def localized(fn):
    """ Decorator: Wrap an install.rdf processor to also localize() """
    @wraps(fn)
    def wrapper(fp, **kw):
        fp = fn(fp, **kw)
        return localize(fp, **kw)
    return wrapper


def releasify(fp, **kw):
    """ Decorator: Transform into release version """
    kw = kw
    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, "id")[0].childNodes[0]
    node.data = RELEASE_ID

    io = BytesIO()
    with Reset(io):
        io.write(rdf.toxml(encoding="utf-8"))
    rdf.unlink()
    return io


def set_uurl(fp, **kw):
    """ Set the updateURL """

    with Reset(fp):
        rdf = XML(fp.read())

    node = rdf.getElementsByTagNameNS(NS_EM, 'aboutURL')[0]
    u = rdf.createElementNS(NS_EM, 'em:updateURL')
    u.appendChild(rdf.createTextNode(kw.get("updateurl")))
    node.parentNode.insertBefore(u, node)
    node.parentNode.insertBefore(rdf.createTextNode('\n\t\t'), node)

    io = BytesIO()
    with Reset(io):
        io.write(rdf.toxml(encoding="utf-8"))
    rdf.unlink()
    return io


@localized
def releaserdf(fp, **kw):
    """ Preprocesses install.rdf for release mode """

    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].childNodes[0]
    if not re.match(r"^[\d.]+$", node.data) and not kw.get("force"):
        raise ValueError("Invalid release version: {}".format(node.data))

    return releasify(fp, **kw)


@localized
def betardf(fp, **kw):
    """ Preprocess install.rdf for beta mode """

    with Reset(fp):
        rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].firstChild
    if not re.match(r"^\d\.\db\d+$", node.data):
        raise ValueError("Invalid beta version: {}".format(node.data))

    return set_uurl(releasify(fp, **kw), **kw)


@localized
def nightlyrdf(fp, **kw):
    """ Preprocesses install.rdf for nightly mode """

    rdf = XML(fp.read())
    # update the version
    node = rdf.getElementsByTagNameNS(NS_EM, 'version')[0].childNodes[0]
    node.data += strftime(".%Y%m%d.%Hh%Mm%Ss")
    # a new name
    node = rdf.getElementsByTagNameNS(NS_EM, 'name')[0].childNodes[0]
    node.data += " *nightly*"

    io = BytesIO()
    with Reset(io):
        io.write(rdf.toxml(encoding="utf-8"))
    rdf.unlink()
    return set_uurl(io, **kw)


@localized
def devrdf(fp, **kw):
    """ Preprocesses install.rdf for default mode """
    kw = kw
    rdf = XML(fp.read())
    node = rdf.getElementsByTagNameNS(NS_EM, 'name')[0].childNodes[0]
    node.data += " *unofficial developer build*"

    io = BytesIO()
    with Reset(io):
        io.write(rdf.toxml(encoding="utf-8"))
    rdf.unlink()
    return io


@WorkingDirectory.change
def pack(xpi, patterns, **kw):
    """ Build the actual XPI """

    packing = sorted(set(files(*patterns, excluded=EXCLUDED)),
                     key=filesort)
    with ZipFile(xpi, "w", ZIP_DEFLATED) as zp:
        def write(fn, mode, modifier=None):
            """Write a file, propably modified"""
            with open(fn, "rb") as fp:
                if modifier:
                    with modifier(fp, **kw) as mp:
                        zp.writestr(fn, mp.read(), mode)
                else:
                    zp.writestr(fn, fp.read(), mode)

        with Minor(zp):
            for f in packing:
                if f == "modules/version.js" and \
                        kw.get("type", None) in ("release", "beta"):
                    write(f, ZIP_DEFLATED, releaseversionjs)
                elif f == "install.rdf":
                    t = kw.get("type", None)
                    if t == "release":
                        write(f, ZIP_DEFLATED, releaserdf)
                    elif t == "beta":
                        write(f, ZIP_DEFLATED, betardf)
                    elif t == "nightly":
                        write(f, ZIP_DEFLATED, nightlyrdf)
                    else:
                        write(f, ZIP_DEFLATED, devrdf)
                elif not kw.get("tests", False) and \
                        (f == "chrome.manifest" or f == "modules/main.js"):
                    write(f, ZIP_DEFLATED, droptests)
                elif any(fnmatch(f, p) for p in PLAIN):
                    write(f, ZIP_STORED)
                else:
                    write(f, ZIP_DEFLATED)


def create(args):
    """ Process arguments and create the XPI """

    parser = ArgumentParser()
    parser.add_argument(
        "--force",
        dest="force",
        help="force overwrite output file if exists",
        action="store_true",
        default=False
        )
    parser.add_argument(
        "--release",
        dest="type",
        help="create release XPI",
        action="store_const",
        const="release"
        )
    parser.add_argument(
        "--beta",
        dest="type",
        help="create release XPI",
        action="store_const",
        const="beta"
        )
    parser.add_argument(
        "--nightly",
        dest="type",
        help="create nightly XPI",
        action="store_const",
        const="nightly"
        )
    parser.add_argument(
        "--updateURL",
        dest="updateurl",
        help="nightly update url",
        type=str,
        default=None
        )
    parser.add_argument(
        "--tests",
        dest="tests",
        help="ships tests as well",
        action="store_true",
        default=False
        )
    parser.add_argument(
        "xpi",
        nargs=1,
        type=str,
        help="output XPI"
        )
    args = parser.parse_args(args)

    patterns = FILES
    if args.tests:
        patterns += TESTS

    output = args.xpi.pop()
    del args.xpi

    if args.type in ("nightly", "beta") and not args.updateurl:
        raise ValueError("Nightly/Beta requested but no update URL provided")
    elif args.type == "release" and args.updateurl:
        raise ValueError("Release versions cannot have an update URL")
    if not args.force and os.path.exists(output):
        raise ValueError("Output file already exists")

    check_locales(errors_only=True)

    with BytesIO() as io:
        try:
            with Reset(io):
                pack(io, patterns, **args.__dict__)
        except Exception as ex:
            raise Exception("Failed packing: {}".format(ex)) from ex

        try:
            with open(output, "wb") as op:
                op.write(io.read())
        except Exception as ex:
            raise Exception("Failed writing XPI: {}".format(ex)) from ex


if __name__ == "__main__":
    create(sys.argv[1:])
