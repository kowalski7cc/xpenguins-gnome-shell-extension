/* *** CODE *** */
const Clutter  = imports.gi.Clutter;
const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;
const Gtk      = imports.gi.Gtk;
const Lang     = imports.lang;
const Mainloop = imports.mainloop;
const Meta      = imports.gi.Meta;
const Pango    = imports.gi.Pango;
const St       = imports.gi.St;

const AltTab    = imports.ui.altTab;
const Main      = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

/* my files */
// temp until two distinct versions:
var Me;
try {
    Me = imports.ui.extensionSystem.extensions['xpenguins@mathematical.coffee.gmail.com'];
} catch (err) {
    Me = imports.misc.extensionUtils.getCurrentExtension().imports;
}
const ThemeManager = Me.themeManager;
const WindowListener = Me.windowListener;
const XPenguins = Me.xpenguins;
const XPUtil = Me.util;

/* make a status button to click with options */
let _indicator, extensionPath;

function init(metadata) {
    extensionPath = metadata.path;
}

function enable() {
    _indicator = new XPenguinsMenu(extensionPath);
    Main.panel.addToStatusArea('xpenguins-menu', _indicator);
}

function disable() {
    if (_indicator) {
        // _indicator.penguinLoop.FREE/EXITNOW
        _indicator.destroy();
    }
}

//// Classes ////

function WindowPickerDialog() {
    this._init.apply(this, arguments);
}

WindowPickerDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function () {
        ModalDialog.ModalDialog.prototype._init.call(this,
            {styleClass: 'modal-dialog'});

        let monitor = global.screen.get_monitor_geometry(global.screen.get_primary_monitor()),
            width   = Math.round(monitor.width * .6),
            height  = Math.min(300, Math.round(monitor.height * .3));

        /* title + icon */
        let box = new St.BoxLayout();
        box.add(new St.Label({text: _("Select which window to run XPenguins in, or 'Cancel' to use the Desktop:")}),
                    {x_fill: true});
        this.contentLayout.add(box, {x_fill: true});

        /* scroll box */
        this.scrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            width: width,
            height: height
        });
        // automatic horizontal scrolling, no vertical scrolling
        this.scrollBox.set_policy(Gtk.PolicyType.AUTOMATIC,
            Gtk.PolicyType.NEVER);

        /* thumbnails in scroll box (put in BoxLayout or else cannot see) */
        let box = new St.BoxLayout();
        // TODO: add 'desktop' window.
        this._windows = global.get_window_actors().map(function (w) {
            return w.meta_window;
        });
        /* filter out Nautilus desktop window */
        this._windows = this._windows.filter(function (w) {
            return w.window_type != Meta.WindowType.DESKTOP;
        });
        // TODO: add a desktop clone here but redirect to global.stage.
        this._thumbnails = new AltTab.ThumbnailList(this._windows);
        this._thumbnails.actor.get_allocation_box();
        box.add(this._thumbnails.actor, {expand: true, x_fill: true, y_fill: true});
        this.scrollBox.add_actor(box,
            {expand: true, x_fill: true, y_fill: true});
        this.contentLayout.add(this.scrollBox, {expand: true, x_fill: true, y_fill: true});
        // need to call addClones at some point. it was called in _allocate ...

        /* Cancel button */
        this.setButtons([{
            label: _("Cancel"),
            action: Lang.bind(this, function () {
                this._windowActivated(this._thumbnails, -1);
            })
        }]);
	},

    open: function() {
        ModalDialog.ModalDialog.prototype.open.apply(this, arguments);
        this._thumbnails.addClones(this.scrollBox.height);
        this._thumbnails.connect('item-activated', Lang.bind(this, this._windowActivated));
        this._thumbnails.connect('item-entered', Lang.bind(this, this._windowEntered));
    },

    _windowActivated: function (thumbnails, n) {
        this.emit('window-selected', this._windows[n]);
        this.close(global.get_current_time());
    },

    _windowEntered: function (thumbnails, n) {
        this._thumbnails.highlight(n);
    },

     /* In case it is somehow destroyed without close() being called */
    _onDestroy: function () {
        this.emit('window-selected', null);
    }
};

/* Popup dialog with scrollable text.
 * See InstallExtensionDialog in extensionSystem.js for an example.
 *
 * Future icing: make one toon of each type in the theme and have them run
 * in the about dialog.
 */
function AboutDialog() {
    this._init.apply(this, arguments);
}

AboutDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function (title, text, icon_path) {
        ModalDialog.ModalDialog.prototype._init.call(this,
            {styleClass: 'modal-dialog'});

        let monitor = global.screen.get_monitor_geometry(global.screen.get_primary_monitor()),
            width   = Math.max(400, Math.round(monitor.width / 3)),
            height  = Math.max(400, Math.round(monitor.height / 2.5));

        /* title + icon */
        this.titleBox = new St.BoxLayout({vertical: false});
        this.contentLayout.add(this.titleBox,
            {x_fill: false, x_align: St.Align.MIDDLE});

        this.icon = new St.Icon({
            icon_name: 'image-missing',
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'xpenguins-about-icon'
        });
        this.setIcon(icon_path);
        this.titleBox.add(this.icon);

        this.title = new St.Label({text: title || '',
            style_class: 'xpenguins-about-title'});
        this.titleBox.add(this.title,  {x_fill: true});

        /* scroll box */
        this.scrollBox = new St.ScrollView({
            x_fill: true,
            y_fill: true,
            width: width,
            height: height
        });
        // automatic horizontal scrolling, automatic vertical scrolling
        this.scrollBox.set_policy(Gtk.PolicyType.AUTOMATIC,
            Gtk.PolicyType.AUTOMATIC);

        /* text in scrollbox.
         * For some reason it won't display unless in a St.BoxLayout. */
        this.text = new St.Label({text: (text || ''),
            style_class: 'xpenguins-about-text'});
        this.text.clutter_text.ellipsize = Pango.EllipsizeMode.NONE; // allows scrolling
        //this.text.clutter_text.line_wrap = true;

        this.box = new St.BoxLayout();
        this.box.add(this.text, { expand: true });
        this.scrollBox.add_actor(this.box,
            {expand: true, x_fill: true, y_fill: true});
        this.contentLayout.add(this.scrollBox,
            {expand: true, x_fill: true, y_fill: true});

        /* OK button */
        this.setButtons([{
            label: _("OK"),
            action: Lang.bind(this, function () {
                this.close(global.get_current_time());
            })
        }]);
	},

    setTitle: function (title) {
        this.title.text = title;
    },

    setText: function (text) {
        this.text.text = text;
    },

    appendText: function (text, sep) {
        this.text.text += (sep || '\n') + text;
    },

    setIcon: function (icon_path) {
        let path = icon_path ? Gio.file_new_for_path(icon_path) : null;
        if (path && path.query_exists(null)) {
            this.icon.set_gicon(new Gio.FileIcon({file: path}));
        }
    }
};

/* A DoubleSliderPopupMenuItem paired with a text label & two number labels */
function DoubleSliderMenuItem() {
    this._init.apply(this, arguments);
}

DoubleSliderMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, valLower, valUpper, min, max, round, ndec, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        /* set up properties */
        this.min = min || 0;
        this.max = max || 1;
        this.round = round || false;
        this._values = [valLower, valUpper];
        this._numVals = this._values.length; // pre-cache
        if (round) {
            this._values = this._values.map(function (v) {
                return Math.round(v);
            });
        }
        this.ndec = this.ndec || (round ? 0 : 2);

        /* set up item */
        this.box = new St.BoxLayout({vertical: true});
        this.addActor(this.box, {expand: true, span: -1});

        this.topBox = new St.BoxLayout({vertical: false, 
            style_class: 'double-slider-menu-item-top-box'});
        this.box.add(this.topBox, {x_fill: true});

        this.bottomBox = new St.BoxLayout({vertical: false, 
            style_class: 'double-slider-menu-item-bottom-box'});
        this.box.add(this.bottomBox, {x_fill: true});

        /* text */
        this.label = new St.Label({text: text, reactive: false,
            style_class: 'double-slider-menu-item-label'});

        /* numbers */
        this.numberLabelLower = new St.Label({text: this._values[0].toFixed(this.ndec), 
            reactive: false});
        this.numberLabelUpper = new St.Label({text: this._values[1].toFixed(this.ndec), 
            reactive: false});
        this.numberLabelLower.add_style_class_name('double-slider-menu-item-number-label');
        this.numberLabelUpper.add_style_class_name('double-slider-menu-item-number-label');

        /* slider */
        this.slider = new DoubleSliderPopupMenuItem(
            (valLower - min) / (max - min),
            (valUpper - min) / (max - min)
        );
       
        /* connect up signals */
        this.slider.connect('value-changed', Lang.bind(this, this._updateValue));
        /* pass through the drag-end, clicked signal. */
        this.slider.connect('drag-end', Lang.bind(this, function (actor, which, value) { 
            this.emit('drag-end', which, this._values[which]);
        }));
        // Note: if I set the padding in the css it gets overridden
        this.slider.actor.set_style('padding-left: 0em; padding-right: 0em;');

        /* assemble the item */
        this.topBox.add(this.numberLabelLower, {x_align: St.Align.START});
        this.topBox.add(this.label, {expand: true, x_align: St.Align.MIDDLE});
        this.topBox.add(this.numberLabelUpper, {x_align: St.Align.END});
        this.bottomBox.add(this.slider.actor, {expand: true, span: -1});
    },

    /* returns the value of the slider, either the raw (0-1) value or the
     * value on the min->max scale. */
    getValue: function (which, raw) {
        if (raw) {
            return this.slider.getValue(which);
        } else {
            return this._values[which];
        }
    },

    getLowerValue: function (raw) {
        return this.getValue(0, raw);
    },

    getUpperValue: function (raw) {
        return this.getValue(1, raw);
    },

    setLowerValue: function (value, raw) {
        this.setValue(0, value, raw);
    },

    setUpperValue: function (value, raw) {
        this.setValue(1, value, raw);
    },

    /* sets the value of the slider, either the raw (0-1) value or the
     * value on the min->max scale */
    setValue: function (which, value, raw) {
        value = (raw ? value : (value - this.min) / (this.max - this.min));
        this._updateValue(this.slider, which, value);
        this.slider.setValue(which, value);
    },

    _updateValue: function (slider, which, value) {
        let val = value * (this.max - this.min) + this.min;
        if (this.round) {
            val = Math.round(val);
        }
        this._values[which] = val;
        if (which === 0) {
            this.numberLabelLower.set_text(val.toFixed(this.ndec));
        } else {
            this.numberLabelUpper.set_text(val.toFixed(this.ndec));
        }
    }
};
/* A SliderMenuItem with two slidable things, for
 * selecting a range. Basically a modified PopupSliderMenuItem.
 * It has no scroll or key-press event as it's hard to tell which
 *  blob the user meant to scroll.
 */
function DoubleSliderPopupMenuItem() {
    this._init.apply(this, arguments);
}
DoubleSliderPopupMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (val1, val2) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, 
            { activate: false });

        if (isNaN(val1) || isNaN(val2))
            // Avoid spreading NaNs around
            throw TypeError('The slider value must be a number');

        this._values = [Math.max(Math.min(val1, 1), 0),
            Math.max(Math.min(val2, 1), 0)];

        this._slider = new St.DrawingArea({ style_class: 'popup-slider-menu-item', reactive: true });
        this.addActor(this._slider, { span: -1, expand: true });
        this._slider.connect('repaint', Lang.bind(this, this._sliderRepaint));
        this.actor.connect('button-press-event', Lang.bind(this, this._startDragging));

        this._releaseId = this._motionId = 0;
        this._dragging = false;
    },

    setValue: function (i, value) {
        if (isNaN(value))
            throw TypeError('The slider value must be a number');

        this._value[i] = Math.max(Math.min(value, 1), 0);
        this._slider.queue_repaint();
    },

    getValue: function (which) {
        return this._values[which];
    },

    _sliderRepaint: function(area) {
        let cr = area.get_context();
        let themeNode = area.get_theme_node();
        let [width, height] = area.get_surface_size();

        let handleRadius = themeNode.get_length('-slider-handle-radius');

        let sliderWidth = width - 2 * handleRadius;
        let sliderHeight = themeNode.get_length('-slider-height');

        let sliderBorderWidth = themeNode.get_length('-slider-border-width');

        let sliderBorderColor = themeNode.get_color('-slider-border-color');
        let sliderColor = themeNode.get_color('-slider-background-color');

        let sliderActiveBorderColor = themeNode.get_color('-slider-active-border-color');
        let sliderActiveColor = themeNode.get_color('-slider-active-background-color');

        /* slider active colour from val0 to val1 */
        cr.setSourceRGBA (
            sliderActiveColor.red / 255,
            sliderActiveColor.green / 255,
            sliderActiveColor.blue / 255,
            sliderActiveColor.alpha / 255);
        cr.rectangle(handleRadius + sliderWidth * this._values[0], (height - sliderHeight) / 2,
            sliderWidth * this._values[1], sliderHeight);
        cr.fillPreserve();
        cr.setSourceRGBA (
            sliderActiveBorderColor.red / 255,
            sliderActiveBorderColor.green / 255,
            sliderActiveBorderColor.blue / 255,
            sliderActiveBorderColor.alpha / 255);
        cr.setLineWidth(sliderBorderWidth);
        cr.stroke();

        /* slider from 0 to val0 */
        cr.setSourceRGBA (
            sliderColor.red / 255,
            sliderColor.green / 255,
            sliderColor.blue / 255,
            sliderColor.alpha / 255);
        cr.rectangle(handleRadius, (height - sliderHeight) / 2,
            sliderWidth * this._values[0], sliderHeight);
        cr.fillPreserve();
        cr.setSourceRGBA (
            sliderBorderColor.red / 255,
            sliderBorderColor.green / 255,
            sliderBorderColor.blue / 255,
            sliderBorderColor.alpha / 255);
        cr.setLineWidth(sliderBorderWidth);
        cr.stroke();

        /* slider from val1 to 1 */
        cr.setSourceRGBA (
            sliderColor.red / 255,
            sliderColor.green / 255,
            sliderColor.blue / 255,
            sliderColor.alpha / 255);
        cr.rectangle(handleRadius + sliderWidth * this._values[1], 
            (height - sliderHeight) / 2,
            sliderWidth, sliderHeight);
        cr.fillPreserve();
        cr.setSourceRGBA (
            sliderBorderColor.red / 255,
            sliderBorderColor.green / 255,
            sliderBorderColor.blue / 255,
            sliderBorderColor.alpha / 255);
        cr.setLineWidth(sliderBorderWidth);
        cr.stroke();

        /* dots */
        let i = this._values.length;
        while (i--) {
            let val = this._values[i];
            let handleY = height / 2;
            let handleX = handleRadius + (width - 2 * handleRadius) * val;

            let color = themeNode.get_foreground_color();
            cr.setSourceRGBA (
                color.red / 255,
                color.green / 255,
                color.blue / 255,
                color.alpha / 255);
            cr.arc(handleX, handleY, handleRadius, 0, 2 * Math.PI);
            cr.fill();
        }
    },

    /* returns the index of the dot to move */
    _whichDotToMove: function(absX, absY) {
        let relX, relY, sliderX, sliderY;
        [sliderX, sliderY] = this._slider.get_transformed_position();
        relX = absX - sliderX;
        let width = this._slider.width,
            handleRadius = this._slider.get_theme_node().get_length('-slider-handle-radius'),
            newvalue;
        if (relX < handleRadius)
            newvalue = 0;
        else if (relX > width - handleRadius)
            newvalue = 1;
        else
            newvalue = (relX - handleRadius) / (width - 2 * handleRadius);

        return (Math.abs(newvalue - this._values[0]) < 
                Math.abs(newvalue - this._values[1]) ? 0 : 1);
    },

    _endDragging: function(actor, event, which) {
        if (this._dragging) {
            this._slider.disconnect(this._releaseId);
            this._slider.disconnect(this._motionId);

            Clutter.ungrab_pointer();
            this._dragging = false;

            this.emit('drag-end', which, this._values[which]);
        }
        return true;
    },


    _startDragging: function(actor, event) {
        if (this._dragging) // don't allow two drags at the same time
            return;

        this._dragging = true;
        let absX, absY;
        [absX, absY] = event.get_coords();
        let dot = this._whichDotToMove(absX, absY);

        // FIXME: we should only grab the specific device that originated
        // the event, but for some weird reason events are still delivered
        // outside the slider if using clutter_grab_pointer_for_device
        Clutter.grab_pointer(this._slider);
        // DOT
        this._releaseId = this._slider.connect('button-release-event', Lang.bind(this, this._endDragging, dot));
        this._motionId = this._slider.connect('motion-event', Lang.bind(this, this._motionEvent, dot));
        this._moveHandle(absX, absY, dot);
    },

    _motionEvent: function(actor, event, dot) {
        let absX, absY;
        [absX, absY] = event.get_coords();
        this._moveHandle(absX, absY, dot);
        return true;
    },

    /* Don't let the bottom slider cross over the top slider
     * and vice versa */
    _moveHandle: function(absX, absY, which) {
        let relX, relY, sliderX, sliderY;
        [sliderX, sliderY] = this._slider.get_transformed_position();
        relX = absX - sliderX;
        relY = absY - sliderY;

        let width = this._slider.width,
            handleRadius = this._slider.get_theme_node().get_length('-slider-handle-radius'),
            newvalue = (relX - handleRadius) / (width - 2 * handleRadius);

        newvalue = Math.max(which == 0 ? 0 : this._values[0], 
            Math.min(newvalue, which == 0 ? this._values[1] : 1));
        this._values[which] = newvalue;
        this._slider.queue_repaint();
        this.emit('value-changed', which, this._values[which]);
    }
};

/* A slider with a label + number that updates with the slider
 * text: the text for the item
 * defaultVal: the intial value for the item (on the min -> max scale)
 * min, max: the min and max values for the slider
 * round: whether to round the value to the nearest integer
 * ndec: number of decimal places to round to
 * params: other params for PopupBaseMenuItem
 */
function SliderMenuItem() {
    this._init.apply(this, arguments);
}
SliderMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (text, defaultVal, min, max, round, ndec, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        /* set up properties */
        this.min = min || 0;
        this.max = max || 1;
        this.round = round || false;
        this._value = defaultVal;
        if (round) {
           this._value = Math.round(this._value);
        }
        this.ndec = this.ndec || (round ? 0 : 2);

        /* set up item */
        this.box = new St.BoxLayout({vertical: true});
        this.addActor(this.box, {expand: true, span: -1});

        this.topBox = new St.BoxLayout({vertical: false,
            style_class: 'slider-menu-item-top-box'});
        this.box.add(this.topBox, {x_fill: true});

        this.bottomBox = new St.BoxLayout({vertical: false,
            style_class: 'slider-menu-item-bottom-box'});
        this.box.add(this.bottomBox, {x_fill: true});

        /* text */
        this.label = new St.Label({text: text, reactive: false});

        /* number */
        this.numberLabel = new St.Label({text: this._value.toFixed(this.ndec), 
            reactive: false});

        /* slider */
        this.slider = new PopupMenu.PopupSliderMenuItem((defaultVal - min) /
            (max - min)); // between 0 and 1

        /* connect up signals */
        this.slider.connect('value-changed', Lang.bind(this, this._updateValue));
        /* pass through the drag-end, clicked signal */
        this.slider.connect('drag-end', Lang.bind(this, function () {
            this.emit('drag-end', this._value);
        }));
        // Note: if I set the padding in the css it gets overridden
        this.slider.actor.set_style('padding-left: 0em; padding-right: 0em;');

        /* assemble the item */
        this.topBox.add(this.label, {expand: true});
        this.topBox.add(this.numberLabel, {align: St.Align.END});
        this.bottomBox.add(this.slider.actor, {expand: true, span: -1});

        /* Debugging */
        /*
        this.box.set_style('border: 1px solid red;');
        this.topBox.set_style('border: 1px solid green;');
        this.bottomBox.set_style('border: 1px solid blue;');
        */
    },

    /* returns the value of the slider, either the raw (0-1) value or the
     * value on the min->max scale. */
    getValue: function (raw) {
        if (raw) {
            return this.slider.value;
        }
        return this._value;
    },

    /* sets the value of the slider, either the raw (0-1) value or the
     * value on the min->max scale */
    setValue: function (value, raw) {
        value = (raw ? value : (value - this.min) / (this.max - this.min));
        this._updateValue(this.slider, value);
        this.slider.setValue(value);
    },

    _updateValue: function (slider, value) {
        let val = value * (this.max - this.min) + this.min;
        if (this.round) {
            val = Math.round(val);
        }
        this._value = val;
        this.numberLabel.set_text(val.toFixed(this.ndec));
    },
};

function ThemeSliderMenuItem() {
    this._init.apply(this, arguments);
}

ThemeSliderMenuItem.prototype = {
    __proto__: SliderMenuItem.prototype,

    _init: function () {
        SliderMenuItem.prototype._init.apply(this, arguments);

        /* Icon (default no icon) */
        this.icon = new St.Icon({
            icon_name: 'image-missing', // placeholder icon
            icon_type: St.IconType.FULLCOLOR,
            style_class: 'popup-menu-icon'
        });

        /* Info button */
        this.button = new St.Button();
        let icon = new St.Icon({
            icon_name: 'help-contents',
            style_class: 'popup-menu-icon',
            icon_type: St.IconType.FULLCOLOR
        });
        this.button.set_child(icon);

        this.label.add_style_class_name('theme-slider-menu-item-label');
        // Note: if I set the padding in the css it gets overridden
        this.slider.actor.set_style('padding-left: 0.5em; padding-right: 0em;');

        /* connect up signals */
        this.button.connect('clicked', Lang.bind(this, function () {
            this.emit('button-clicked');
        }));

        /* assemble the item */
        // polyglot insert_before/insert_child_at_index
        if (this.topBox.insert_before) {
            this.topBox.insert_before(this.icon, this.label);
            this.bottomBox.insert_before(this.button, this.slider.actor);
        } else {
            this.topBox.insert_child_at_index(this.icon, 0);
            this.bottomBox.insert_child_at_index(this.button, 0);
        }
    },

    /* sets the icon from a path */
    setIcon: function () {
        AboutDialog.prototype.setIcon.apply(this, arguments);
    }
};

function LoadAverageSliderMenuItem() {
    this._init.apply(this, arguments);
}

LoadAverageSliderMenuItem.prototype = {
    __proto__: DoubleSliderMenuItem.prototype,

    _init: function () {
        DoubleSliderMenuItem.prototype._init.apply(this, arguments);

        /* set styles */
        this.numberLabelLower.add_style_class_name('xpenguins-load-averaging');
        this.numberLabelUpper.add_style_class_name('xpenguins-load-averaging');
    },

    setBeingUsed: function(usedLower, usedUpper) {
        if (usedLower) {
            this.numberLabelLower.add_style_pseudo_class('loadAveragingActive');
        } else {
            this.numberLabelLower.remove_style_pseudo_class('loadAveragingActive');
        }
        if (usedUpper) {
            this.numberLabelUpper.add_style_pseudo_class('loadAveragingActive');
        } else {
            this.numberLabelUpper.remove_style_pseudo_class('loadAveragingActive');
        }
    }
}

/*
 * XPenguinsMenu Object
 */
function XPenguinsMenu() {
    this._init.apply(this, arguments);
}

XPenguinsMenu.prototype = {
    __proto__: PanelMenu.SystemStatusButton.prototype,

    _init: function (extensionPath) {
        XPUtil.DEBUG('_init');
        /* Initialise */
        PanelMenu.SystemStatusButton.prototype._init.call(this,
            'emblem-favorite', 'xpenguins');
        this.actor.add_style_class_name('xpenguins-icon');
        this.setGIcon(new Gio.FileIcon({
            file: Gio.file_new_for_path(GLib.build_filenamev([extensionPath,
                      'penguin.png']))
        }));

        /* items */
        this._optionsMenu = null;
        this._themeMenu = null;
        this._items = {};
        this._themeInfo = {};
        this._toggles = {
            ignorePopups       : _("Ignore popups"),
            ignoreMaximised    : _("Ignore maximised windows"),
            ignoreHalfMaximised: _(".. and half-maximised too"),
            onAllWorkspaces    : _("Always on visible workspace"),
            onDesktop          : _("Run on desktop"), // not fully implemented
            blood              : _("Show blood"),
            angels             : _("Show angels"),
            squish             : _("God Mode"),
            windowPreview      : _("Window Preview"),
        };
        this._ABOUT_ORDER = ['name', 'date', 'artist', 'copyright',
            'license', 'maintainer', 'location', 'comment'];
        this._THEME_STRING_LENGTH_MAX = 15;

        /* Create menus */
        this._createMenu();

        /* create an Xpenguin Loop object which stores the XPenguins program */
        this._XPenguinsLoop = new XPenguins.XPenguinsLoop(this.getConf());

        /* Stuff that needs _XPenguinsLoop to be initialised */
        // populate themes
        this._populateThemeMenu();
        // Listen to 'ntoons-changed' and adjust slider accordingly
        this._XPenguinsLoop.connect('ntoons-changed', Lang.bind(this,
            this._onChangeThemeNumber));
        if (this._items.loadAveraging) {
            this._XPenguinsLoop.connect('load-averaging-start', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(true, false); }));
            this._XPenguinsLoop.connect('load-averaging-end', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(false, false); }));
            this._XPenguinsLoop.connect('load-averaging-kill', Lang.bind(this,
                function () { this._items.loadAveraging.setBeingUsed(true, true); }));
        }
        this._XPenguinsLoop.connect('xpenguins-stopped', Lang.bind(this,
            function () {
                this._items.start.setToggleState(false);
                if (this._items.loadAveraging) {
                    this._items.loadAveraging.setBeingUsed(false, false);
                }
            }));

        /* @@ debugging windowListener */
        this._windowListener = new WindowListener.WindowListener();

    },

    getConf: function () {
        let opts = {};
        for (let propName in this._toggles) {
            if (this._toggles.hasOwnProperty(propName) && this._items[propName]) {
                opts[propName] = this._items[propName].state;
            }
        }
        return opts;
    },

    changeOption: function (item, propVal, whatChanged) {
        XPUtil.DEBUG(('changeOption[ext]:' + whatChanged + ' -> ' + propVal));
        if (this._windowListener) {
            this._windowListener.changeOption(whatChanged, propVal);
        }
        this._XPenguinsLoop.changeOption(whatChanged, propVal);

        /* start/stop the windowListener */
        if (whatChanged === 'windowPreview' && this._XPenguinsLoop.is_playing()) {
            if (propVal) {
                this._windowListener.start();
            } else {
                this._windowListener.stop();
            }
        }
    },

    _createMenu: function () {
        XPUtil.DEBUG('_createMenu');
        let dummy,
            defaults = XPenguins.XPenguinsLoop.prototype.defaultOptions(),
            blacklist = XPenguins.getCompatibleOptions(true);

        /* clear the menu */
        this.menu.removeAll();

        /* toggle to start xpenguins */
        this._items.start = new PopupMenu.PopupSwitchMenuItem(_("Start"),
            false);
        this._items.start.connect('toggled', Lang.bind(this,
            this._startXPenguins));
        this.menu.addMenuItem(this._items.start);

        /* theme submenu */
        this._themeMenu = new PopupMenu.PopupSubMenuMenuItem(_("Theme"));
        this.menu.addMenuItem(this._themeMenu);

        /* choice of window */
        if (!blacklist.onDesktop) {
            this._items.onDesktop = new PopupMenu.PopupMenuItem(_("Running in: ") + _("Desktop"));
            this._items.onDesktop.connect('activate', Lang.bind(this,
                this._onChooseWindow));
            this.menu.addMenuItem(this._items.onDesktop);
        }

        /* options submenu */
        this._optionsMenu = new PopupMenu.PopupSubMenuMenuItem(_("Options"));
        this.menu.addMenuItem(this._optionsMenu);

        /* ignore maximised, ignore popups, ignore half maximised, god mode,
         * always on visible workspace, angels, blood, verbose toggles */
        // remove windowPreview code in release branches
        blacklist.windowPreview = true;
        defaults.windowPreview = false;
        for (let propName in this._toggles) {
            if (this._toggles.hasOwnProperty(propName) && !blacklist[propName]) {
                this._items[propName] = new PopupMenu.PopupSwitchMenuItem(
                    this._toggles[propName], defaults[propName] || false);
                this._items[propName].connect('toggled',
                    Lang.bind(this, this.changeOption, propName));
                this._optionsMenu.menu.addMenuItem(this._items[propName]);
            }
        }

        /* ignore half maximised should be greyed out/unusable if
         * 'ignoreMaximised' is false, and usable if it's true.
         * reactive: false?
         */
        if (this._items.ignoreHalfMaximised && this._items.ignoreMaximised) {
            this._items.ignoreMaximised.connect('toggled', Lang.bind(this,
                function (item, state) {
                    this._items.ignoreHalfMaximised.setSensitive(state);
                }));
            this._items.ignoreHalfMaximised.setSensitive(this._items.ignoreMaximised.state);
        }

        /* animation speed */
        this._items.delay = new SliderMenuItem(_("Time between frames (ms)"),
                60, 10, 200, true);
        this._optionsMenu.menu.addMenuItem(this._items.delay);
        this._items.delay.connect('drag-end', Lang.bind(this, this.changeOption,
            'sleep_msec'));

        /* Load averaging. */
        // TODO: what is reasonable? look at # CPUs and times by fudge factor?
        if (!blacklist.loadAveraging) {
            this._items.loadAveraging = new LoadAverageSliderMenuItem(_("Load average reduce threshold"),
                    -0.01, 2, -0.01, 2, false, 2);
            this._optionsMenu.menu.addMenuItem(this._items.loadAveraging);
            this._items.loadAveraging.connect('drag-end', Lang.bind(this, function (slider, which, val) {
                if (which === 0) {
                    /* set load2 first to avoid problems with it being unset */
                    this.changeOption(this._items.loadAveraging, this._items.loadAveraging.getUpperValue(), 'load2');
                }
                this.changeOption(this._items.loadAveraging, val, 'load' + (which+1));
            }));
        }

        /* RecalcMode combo box: only if global.display has grab-op- events. */
        if (!blacklist.recalcMode) {
            this._items.recalc = new PopupMenu.PopupComboBoxMenuItem({});
            this._optionsMenu.menu.addMenuItem(this._items.recalc);
            for (let mode in XPenguins.RECALC) {
                if (XPenguins.RECALC.hasOwnProperty(mode)) {
                    dummy = new PopupMenu.PopupMenuItem('Recalc mode: ' + mode);
                    this._items.recalc.addMenuItem(dummy, XPenguins.RECALC[mode]);
                }
            }
            this._items.recalc.setActiveItem(XPenguins.RECALC.ALWAYS);
            this._items.recalc.connect('active-item-changed',
                Lang.bind(this, function (item, id) {
                    this.changeOption(null, id, 'recalcMode');
                }));
        }
    },

    _populateThemeMenu: function () {
        XPUtil.DEBUG("_populateThemeMenu");
        this._themeMenu.menu.removeAll();
        this._items.themes = {};
        let themeList = ThemeManager.listThemes();

        if (themeList.length === 0) {
            this._themeMenu.label.set_text(_("No themes found, click to reload!"));
            this._reloadThemesID = this._themeMenu.menu.connect('open-state-changed',
                Lang.bind(this, this._populateThemeMenu));
        } else {
            this._themeInfo = ThemeManager.describeThemes(themeList, false);
            for (let i = 0; i < themeList.length; ++i) {
                let sanitised_name = ThemeManager.sanitiseThemeName(themeList[i]);
                this._items.themes[sanitised_name] = new ThemeSliderMenuItem(
                    _(themeList[i]), 0, 0, XPenguins.PENGUIN_MAX, true);
                this._items.themes[sanitised_name].setIcon(this._themeInfo[sanitised_name].icon);
                this._items.themes[sanitised_name].connect('drag-end',
                    Lang.bind(this, this._onChangeTheme, sanitised_name, true));
                this._items.themes[sanitised_name].connect('button-clicked',
                    Lang.bind(this, this._onShowHelp, sanitised_name));
                this._themeMenu.menu.addMenuItem(this._items.themes[sanitised_name]);
            }
            if (this._reloadThemesID) {
                this._themeMenu.menu.disconnect(this._reloadThemesID);
                delete this._reloadThemesID;
            }
            if (this._items.themes['Penguins']) {
                this._onChangeTheme(this._items.themes['Penguins'], -1, 'Penguins',
                    false);
            } else {
                this._themeMenu.label.set_text(_("Theme"));
            }
        }
    },

    _onShowHelp: function (button, name) {
        if (!this._themeInfo[name]) {
            this._themeInfo[name] = ThemeManager.describeThemes([name], false)[name];
        }

        let dialog = new AboutDialog(this._themeInfo[name].name);
        for (let i = 0; i < this._ABOUT_ORDER.length; ++i) {
            let propName = this._ABOUT_ORDER[i];
            if (this._themeInfo[name][propName]) {
                dialog.appendText('%s%s: %s'.format(
                    propName.charAt(0).toUpperCase(),
                    propName.slice(1),
                    this._themeInfo[name][propName]
                ));
            }
        }
        dialog.setIcon(this._themeInfo[name].icon);
        dialog.open(global.get_current_time());
    },

    _onChangeTheme: function (item, value, sanitised_name, silent) {
        XPUtil.DEBUG('_onChangeTheme: ' + sanitised_name);

        /* set the numbers so we can read them back to the slider bars */
        this._XPenguinsLoop.setThemeNumbers(sanitised_name, value, silent);

        let themeListFlat = this._XPenguinsLoop.getThemes();
        if (themeListFlat.length) {
            themeListFlat = themeListFlat.map(function (name) {
                return ThemeManager.prettyThemeName(name);
            }).reduce(function (x, y) {
                return x + ',' + y;
            });
            if (themeListFlat.length > this._THEME_STRING_LENGTH_MAX) {
                themeListFlat = themeListFlat.substr(0,
                    this._THEME_STRING_LENGTH_MAX - 3) + '...';
            }
        } else {
            themeListFlat = 'none';
        }
        this._themeMenu.label.set_text(_("Theme") + ' (%s)'.format(themeListFlat));
    },

    _onChangeThemeNumber: function (loop, sanitised_name, n) {
        XPUtil.DEBUG('[ext] _onChangeThemeNumber[%s] to %d; updating slider',
            sanitised_name, n);
        if (n !== this._items.themes[sanitised_name].getValue()) {
            this._items.themes[sanitised_name].setValue(n);
        }
    },

    _onChooseWindow: function () {
        XPUtil.DEBUG('[ext] _onChooseWindow');
        let dialog = new WindowPickerDialog();
        dialog.open(global.get_current_time());
        dialog._windowSelectedID = dialog.connect('window-selected', Lang.bind(this, this._onWindowChosen));
    },

    _onWindowChosen: function (dialog, metaWindow) {
        dialog.disconnect(dialog._windowSelectedID);
        /* if meta window is null or has been destroyed in the meantime, use
         * the desktop. */
        this._items.onDesktop.set_text(_("Running in: ") +
            (metaWindow ? metaWindow.get_title() : _("Desktop")));
        // TODO: translate or not?
        
        this.XPenguinsLoop.onDesktop = (!metaWindow);
        this.XPenguinsLoop.setWindow(metaWindow ? 
            metaWindow.get_compositor_private() : global.stage);
    },

    _startXPenguins: function (item, state) {
        XPUtil.DEBUG((state ? 'STARTING ' : 'STOPPING ') + 'XPenguins');
        // UPTO: set numbers back from 0 (if second start, sliders
        // may not be in sync with XPenguinsLoop._number)
        if (state) {
            this._XPenguinsLoop.start();
            if (this._items.windowPreview && this._items.windowPreview.state) {
                this._windowListener.start();
            }
        } else {
            this._XPenguinsLoop.stop();
            if (this._items.windowPreview && this._items.windowPreview.state) {
                this._windowListener.stop();
            }
            if (this._items.loadAveraging) {
                this._items.loadAveraging.setBeingUsed(false, false);
            }
        }
    }
};

