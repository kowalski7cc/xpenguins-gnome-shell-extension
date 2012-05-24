/*********************
 * xpenguins_theme.c
 * xpenguins.h
 * Notes:
 * - genus == theme (penguins, simpsons, ...)
 * TODO:
 * - what to do about eror handling? at them oment thorw new Error
 * BIG TODO: is .master needed?
 *
 * GENUS
 *
 * CONFIG FILE:
 *  toon == walker, skater ('genera'), in which there are types
 *   (walker, faller, tumbler, floater, ...)
 *********************/
/* Imports */
const Extension = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
const XPUtil = Extension.util; 
const Toon   = Extension.toon.Toon;
const ThemeManager = Extension.theme_manager.ThemeManager;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

/* Namespace */
const Theme = Theme || {};

/***********************
 *    Theme Object     *
 ***********************/
/* Contains all the information about the toon,
 * basically an array of ToonData structures.
 */
Theme.Theme = function() {
    this._init.apply(this, arguments);
};

Theme.Theme.prototype = {
    _init: function(themeList) {
        /* members */
        /* Theme: can have one or more genera
         * Genus: class of toons (Penguins has 2: walker & skateboarder).
         * Each genus has toon types: walker, floater, tumbler, faller, ...
         */

        /*
         * this.ToonData: array, one per genus (per theme). this.ToonData[i] = { type_of_toon: ToonData }
         * this.name: array of names, one per genus
         * this.number: array of numbers, one per genus
         *
         * Note: can't have ToonData an object because over multiple themes there can be 
         *  duplicate genus (for example BigPenguins & Penguins both have 'normal' & 'skateboarder').
         */
        this.ToonData = []; // data, one per genus
        this.name = [];    // names of genus
        this.number = [];   // theme penguin numbers
        this.ngenera = 0; // number of different genera
        this.delay = 60;

        /* Initialise */
        for ( let i=0; i<themeList.length; ++i ) {
            this.append_theme(themeList[i]);
        }
    }, // _init

    /* Append the theme named "name" to this theme.
     * To initialise the theme, set theme.ngenera to 0 before
     *  calling this function.
     */
    append_theme: function( name ) {
        /* find theme */
        let file_name = ThemeManager.get_theme_path(name);
        if ( !file_name ) {
            throw new Error('Theme ' + name + ' not found or config file not present');
            return;
        }

        /* Read config file, ignoring comments ('#') and whitespace */
        let words = Shell.get_file_contents_utf8_sync(file_name);
        words = words.replace(/#.+/g,'');
        words = words.replace(/\s+/g,' ');
        words = words.trim().split(' ');

        /* iterate through the words to parse the config file. */
        // note: the 'toon' keyword may be omitted if there's only one
        // genus of toon the the config file.
        let started=false; // whether we've encountered the 'toon' keyword yet.

        let first_genus = this.ngenera; // original number of genera
        let genus = this.ngenera; 
        /* make space for the next toon */
        this.grow();
                                 

        let current;   // the current ToonData
        let def = {};  // holds the default ToonData
        let dummy = {};// any unknown ToonData
        try {
        for ( let i=0; i<words.length; ++i ) {
            // BIG TODO: this.name.length could be < this.ngenera,
            //           because not every genus has a name (e.g. turtles)
            let word=words[i];
            /* define a new genus of toon (walker, skateboarder, ...) */
            // note: the 'toon' word is optional in one-genus themes.
            // If we've already seen the 'toon' word before this must be a
            //  multi-genus theme so make space for it & increment 'genus' index.
            if ( word == 'toon' ) {
                if ( started ) {
                    this.grow();
                    ++genus;
                } else {
                    // first toon in file, don't have to ++genus.
                    started = 1;
                }
                /* store the genus name */
                this.name[genus] = words[++i];
            }
            /* preferred frame delay in milliseconds */
            else if (word == 'delay') {
                this.delay = parseInt(words[++i]);
            }
            /* Various types of toon */
            else if ( word == 'define' ) {
                let type = words[++i];
                /* Define default properties of current genus */
                if ( type == 'default' ) {
                    current = def;
                } 
                /* other types of toon */
                else if ( type.match(/^(walker|faller|tumbler|floater|climber|runner|action[0-5]|exit|explosion|splatted|squashed|zapped|angel)$/) ) {
                    started = 1;
                    /* note: passed by reference. */
                    this.ToonData[genus][type] = new Toon.ToonData(def);
                    current = this.ToonData[genus][type];
                } else {
                    warn(_('Warning: unknown type "%s": ignoring'.format(type)));
                    current = dummy;
                }
                /* extra configuration */
                if ( type == 'exit' ) {
                    current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                } else if ( type == 'explosion' ) {
                    current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                } else if ( type == 'splatted' ) {
                    current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE);
                } else if ( type == 'squashed' ) {
                    current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                } else if ( type == 'zapped' ) {
                    current.conf |= (Toon.NOCYCLE | Toon.INVULNERABLE | Toon.NOBLOCK);
                } else if ( type == 'angel' ) {
                    current.conf |= (Toon.INVULNERABLE | Toon.NOBLOCK);
                }
            } 
            /* Toon Properties */
            else if ( word.match(/^(width|height|speed|acceleration|terminal_velocity|loop)$/) ) {
                current[word] = parseInt(words[++i]);
            } 
            else if ( word.match(/^(frames|directions)/) ) { 
                current['n' + word] = parseInt(words[++i]);
            }
            /* Pixmap */
            else if ( word == 'pixmap' ) {
                let pixmap = words[++i];
                if ( current == def ) {
                    warn(_('Warning: theme config file may not specify a default pixmap, ignoring'));
                } else if ( current == dummy ) { // don't bother.
                    continue;
                } else {
                    /* read in pixmap */
                    if ( pixmap[0] != '/' ) {
                        // convert to absolute path
                        let tmp = file_name.split('/');
                        tmp[tmp.length-1] = pixmap;
                        pixmap = tmp.join('/'); 
                    }

                    /* Pixmap is already defined! */
                    if ( current.texture ) {
                        warn(_('Warning: resetting pixmap to %s'.format(pixmap)));
                        /* Free old pixmap if it is not a copy */
                        // BIGTODO: do I need to "free"/destroy it or is JS garbage collection
                        // good enough that when there are no longer Toon.Datas using this texture
                        // it will be destroyed?
                        if ( !current.master ) {
                            // BIGTODO: what if this is already the master of others?
                            // What happens the the clones' pointers?
                            // (C source: XpmFree(current->image))
                            // Well, that's what the warning is for.
                            current.texture.destroy();
                        }
                    }

                    /* Check if the file has been used before, but only look in
                       the pixmaps for the current theme... */
                    let new_pixmap = 1;
                    for ( let igenus=first_genus; igenus <= genus && new_pixmap; ++igenus ) {
                        let data = this.ToonData[igenus];
                        // note: ToonData[igenus] is an *object* type: ToonData
                        for ( let itype in data ) { 
                            /* data already exists in theme, set master */
                            if ( data[itype].filename && !data[itype].master
                                 && data[itype].filename == pixmap ) {
                                     // set .master & .texture (& hence .filename)
                                     current.set_master( data[itype] );
                                     new_pixmap = 0;
                                     break;
                            }
                        }
                    }

                    /* If we didn't find the pixmap before, it's new */
                    if ( new_pixmap ) {
                        // print('loading new pixmap ' + pixmap);
                        // Sets this.pixmap to Cogl Texture & this.filename to pixmap
                        current.load_texture(pixmap);
                        // If it all worked:
                        current.master = null;
                    }
                }
            } // end pixmap
            /* Number of toons */
            else if ( word == 'number' ) {
                this.number[genus] = parseInt(words[++i]);
            } 
            /* unknown word */
            else {
                warn(_('Warning: Unrecognised word %s, ignoring'.format(word)));
            }
        } // while read word
        } catch (err) {
            throw new Error(_('Error reading config file: config file ended unexpectedly: Line ' + err.lineNumber + ': ' + err.message));
        } /* end config file parsing */
        this.ngenera = genus+1;

        /* Now valid our widths, heights etc with the size of the image
         * for all the types of the genera we just added
         */
        for ( let i=first_genus; i < this.ngenera; ++i ) {
            for ( let j in this.ToonData[i] ) {
                let current = this.ToonData[i][j];
                //if ( !current.exists ) 
                //    continue;
                // sscanf first two %d from current->image[0] to width and height
                let imwidth, imheight;
                if ( (current.nframes = imwidth/current.width) < 1 ) {
                    if ( imwidth < current.width ) {
                        throw new Error(_('Width of xpm image too small for even a single frame'));
                    } else {
                        warn(_('Warning: width of %s is too small to display all frames'.format(
                                        current.filename)));
                    }
                }
                if ( imheight < current.height*current.ndirections ) {
                    if ( (current.ndirections = imheight/current.height) < 1 ) {
                        throw new Error(_('Height of xpm image too small for even a single frame'));
                    } else {
                        warn(_('Warning: height of %s is too small to display all frames'.format(
                                        current.filename)));
                    }
                }
            } // loop through Toon type
            if ( !this.ToonData[i]['walker'] || !this.ToonData[i]['faller'] ) {
                throw new Error(_('Theme must contain at least walkers and fallers'));
            }
        }

        // NOTE: original code sets theme.total = 0
        // and only adds the numbers of the genera we *just* added?
        // i.e. theme.total = sum(theme.number[first_genus:theme.ngenera] ) ??
    },  // append_theme

    get total() {
        return Math.min(global.PENGUIN_MAX, this.number.reduce(function(x,y) x+y));
    },

    grow: function() {
        this.name.push('');
        this.number.push(1);
        this.ToonData.push({}); // object 'toonType': ToonData
        ++this.ngenera;
    },

    destroy: function() {
        /* de-allocate all the ToonData textures */
        let i=this.ToonData.length;
        while ( i-- ) {
            for ( let type in this.ToonData[i] ) {
                this.ToonData[type].destroy();
            }
        }
    }
};

