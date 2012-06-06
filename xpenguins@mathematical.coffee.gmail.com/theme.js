/*********************
 * Contains Theme class.
 * xpenguins_theme.c
 *********************/
/* Imports */
const Shell = imports.gi.Shell;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const ThemeManager = Me.imports.themeManager.ThemeManager;
const Toon   = Me.imports.toon;
const WindowListener = Me.imports.windowListener;
const XPenguins = Me.imports.xpenguins;
const XPUtil = Me.imports.util;

/***********************
 *    Theme Object     *
 ***********************/
/* Contains all the information about the toon,
 * basically an array of ToonData structures.
 */
function Theme() {
    this._init.apply(this, arguments);
};

Theme.prototype = {
    _init: function (themeList) {
        XPUtil.LOG('creating theme');
        /* members */
        /* Theme: can have one or more genera
         * Genus: class of toons (Penguins has 2: walker & skateboarder).
         * Each genus has toon types: walker, floater, tumbler, faller, ...
         *
         * this.toonData: array, one per genus (per theme). this.toonData[i] = { type_of_toon: ToonData }
         * this.number: array of numbers, one per genus
         */
        this.toonData = []; // data, one per genus
        this.number = [];   // theme penguin numbers
        this.nactions = []; /* Number of random actions the genus has (type actionX) */
        this.delay = 60;

        /* Initialise */
        for (let i = 0; i < themeList.length; ++i) {
            XPUtil.DEBUG(' ... appending theme %s', themeList[i]);
            this.appendTheme(themeList[i]);
        }
    }, // _init

    get ngenera() {
        return this.number.length;
    },

    get total() {
        return Math.min(XPenguins.PENGUIN_MAX, this.number.reduce(function (x, y) { return x + y; }));
    },

    /* Append the theme named "name" to this theme. */
    appendTheme: function (iname) {
        /* find theme */
        let name = ThemeManager.sanitiseThemeName(iname),
            file_name = ThemeManager.getThemePath(name);
        if (!file_name) {
            throw new Error('Theme ' + name + ' not found or config file not present');
        }

        /* Read config file, ignoring comments ('#') and whitespace */
        let words = Shell.get_file_contents_utf8_sync(file_name),
            started = false, // whether we've encountered the 'toon' keyword yet
                             // (may be omitted in single-genera files)
            first_genus = this.ngenera,
            genus = this.ngenera,
            current,    // holds the current ToonData
            def = {},   // holds default ToonData
            dummy = {}; // any unknown ToonData

        /* iterate through the words to parse the config file. */
        words = words.replace(/#.+/g, '');
        words = words.replace(/\s+/g, ' ');
        words = words.trim().split(' ');

        /* make space for the next toon */
        this.grow();

        try {
            for (let i = 0; i < words.length; ++i) {
                let word = words[i].toLowerCase();
                /* define a new genus of toon (walker, skateboarder, ...) 
                 * note: the 'toon' word is optional in one-genus themes.
                 * If we've already seen the 'toon' word before this must be a
                 *  multi-genus theme so make space for it & increment 'genus' index.
                 */
                if (word === 'toon') {
                    if (started) {
                        this.grow();
                        ++genus;
                    } else {
                        // first toon in file, don't have to ++genus.
                        started = 1;
                    }
                    /* store the genus index with the theme name */
                    ++i;
                } else if (word === 'delay') {
                /* preferred frame delay in milliseconds */
                    this.delay = parseInt(words[++i], 10);
                } else if (word === 'define') {
                /* Various types of toon */
                    let type = words[++i];
                    /* Define default properties of current genus */
                    if (type === 'default') {
                        current = def;
                    } else if (type.match(/^(walker|faller|tumbler|floater|climber|runner|action[0-5]|exit|explosion|splatted|squashed|zapped|angel)$/)) {
                    /* other types of toon */
                        started = 1;
                        /* note: passed by reference. */
                        this.toonData[genus][type] = new Toon.ToonData(def);
                        current = this.toonData[genus][type];
                        if (type.substr(0, 6) === 'action') {
                            this.nactions[genus]++;
                        }
                    } else {
                        XPUtil.warn(_("Warning: unknown type '%s': ignoring".format(type)));
                        current = dummy;
                    }
                    /* extra configuration */
                    if (type === 'exit') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                    } else if (type === 'explosion') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'splatted') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                    } else if (type === 'squashed') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'zapped') {
                        current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                    } else if (type === 'angel') {
                        current.conf |= (Toon.INVULNERABLE | Toon.NOBLOCK);
                    }
                /* Toon Properties */
                } else if (word.match(/^(width|height|speed|acceleration|terminal_velocity|loop)$/)) {
                    current[word] = parseInt(words[++i], 10);
                } else if (word.match(/^(frames|directions)/)) {
                    current['n' + word] = parseInt(words[++i], 10);
                } else if (word === 'pixmap') {
                /* Pixmap */
                    let pixmap = words[++i];
                    if (current === def) {
                        XPUtil.warn(_("Warning: theme config file may not specify a default pixmap, ignoring"));
                    } else if (current === dummy) { // don't bother.
                        continue;
                    } else {
                        /* read in pixmap */
                        if (pixmap[0] !== '/') {
                            // convert to absolute path
                            let tmp = file_name.split('/');
                            tmp[tmp.length - 1] = pixmap;
                            pixmap = tmp.join('/');
                        }

                        /* Pixmap is already defined! */
                        if (current.texture) {
                            XPUtil.warn(_("Warning: resetting pixmap to %s".format(pixmap)));
                            /* Free old pixmap if it is not a copy */
                            if (!current.master) {
                                current.texture.destroy();
                            }
                        }

                        /* Check if the file has been used before */
                        let new_pixmap = 1;
                        for (let igenus = first_genus; igenus <= genus && new_pixmap; ++igenus) {
                            let data = this.toonData[igenus];
                            for (let itype in data) {
                                /* data already exists in theme, set master */
                                if (data.hasOwnProperty(itype) && data[itype].filename &&
                                        !data[itype].master && data[itype].filename === pixmap) {
                                         // set .master & .texture (& hence .filename)
                                    current.setMaster(data[itype]);
                                    new_pixmap = 0;
                                    break;
                                }
                            }
                        }

                        /* If we didn't find the pixmap before, it's new */
                        if (new_pixmap) {
                            current.loadTexture(pixmap);
                            current.master = null;
                        }
                    }
                } else if (word === 'number') {
                /* Number of toons */
                    this.number[genus] = parseInt(words[++i], 10);
                } else {
                /* unknown word */
                    XPUtil.warn(_("Warning: Unrecognised word %s, ignoring".format(word)));
                }
            } // while read word
        } catch (err) {
            throw new Error(_("Error reading config file: config file ended unexpectedly: Line " + err.lineNumber + ": " + err.message));
        } /* end config file parsing */

        /* Now valid our widths, heights etc with the size of the image
         * for all the types of the genera we just added
         */
        for (let i = first_genus; i < this.ngenera; ++i) {
            for (let j in this.toonData[i]) {
                if (this.toonData[i].hasOwnProperty(j)) {
                    current = this.toonData[i][j];
                    let imwidth = current.texture.width,
                        imheight = current.texture.height;
                    if ((current.nframes = imwidth / current.width) < 1) {
                        if (imwidth < current.width) {
                            throw new Error(_("Width of xpm image too small for even a single frame"));
                        } else {
                            XPUtil.warn(_("Warning: width of %s is too small to display all frames".format(
                                current.filename
                            )));
                        }
                    }
                    if (imheight < current.height * current.ndirections) {
                        if ((current.ndirections = imheight / current.height) < 1) {
                            throw new Error(_("Height of xpm image too small for even a single frame"));
                        } else {
                            XPUtil.warn(_("Warning: height of %s is too small to display all frames".format(
                                current.filename
                            )));
                        }
                    }
                }
            } // loop through Toon type
            if (!this.toonData[i].walker || !this.toonData[i].faller) {
                throw new Error(_("Theme must contain at least walkers and fallers"));
            }
        }
    },  // appendTheme

    grow: function () {
        this.nactions.push(0);
        this.number.push(1);
        this.toonData.push({}); // object 'toonType': ToonData
    },

    destroy: function () {
        /* de-allocate all the ToonData textures */
        let i = this.toonData.length;
        while (i--) {
            for (let type in this.toonData[i]) {
                if (this.toonData[i].hasOwnProperty(type)) {
                    this.toonData[i][type].destroy();
                }
            }
        }
    }
};

