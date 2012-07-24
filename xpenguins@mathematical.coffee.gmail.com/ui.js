const Clutter  = imports.gi.Clutter;
const Gio      = imports.gi.Gio;
const Gtk      = imports.gi.Gtk;
const Lang     = imports.lang;
const Meta     = imports.gi.Meta;
const Pango    = imports.gi.Pango;
const St       = imports.gi.St;

const AltTab    = imports.ui.altTab;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;

const Gettext = imports.gettext.domain('xpenguins');
const _ = Gettext.gettext;

/*
 * Various UI elements.
 */

const WindowPickerDialog = new Lang.Class({
    Name: 'WindowPickerDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function () {
        this.parent({styleClass: 'modal-dialog'});

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
        this._windows = global.get_window_actors().map(function (w) {
            return w.meta_window;
        });
        /* filter out Nautilus desktop window */
        this._windows = this._windows.filter(function (w) {
            return w.window_type != Meta.WindowType.DESKTOP;
        });
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

    open: function(timestamp) {
        this.parent(timestamp);
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
    }
});

/* Popup dialog with scrollable text.
 * See InstallExtensionDialog in extensionSystem.js for an example.
 *
 * Future icing: make one toon of each type in the theme and have them run
 * in the about dialog.
 */

const AboutDialog = new Lang.Class({
    Name: 'AboutDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function (title, text, icon_path) {
        this.parent({styleClass: 'modal-dialog'});

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
});

/* A DoubleSliderPopupMenuItem paired with a text label & two number labels */

const DoubleSliderMenuItem = new Lang.Class({
    Name: 'DoubleSliderMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (text, valLower, valUpper, min, max, round, ndec, params) {
        this.parent(params);

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
});
/* A SliderMenuItem with two slidable things, for
 * selecting a range. Basically a modified PopupSliderMenuItem.
 * It has no scroll or key-press event as it's hard to tell which
 *  blob the user meant to scroll.
 */

const DoubleSliderPopupMenuItem = new Lang.Class({
    Name: 'DoubleSliderPopupMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (val1, val2) {
        this.parent({activate: false});

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
});

/* A slider with a label + number that updates with the slider
 * text: the text for the item
 * defaultVal: the intial value for the item (on the min -> max scale)
 * min, max: the min and max values for the slider
 * round: whether to round the value to the nearest integer
 * ndec: number of decimal places to round to
 * params: other params for PopupBaseMenuItem
 */

const SliderMenuItem = new Lang.Class({
    Name: 'SliderMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (text, defaultVal, min, max, round, ndec, params) {
        this.parent(params);

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
});

const ThemeSliderMenuItem = new Lang.Class({
    Name: 'ThemeSliderMenuItem',
    Extends: SliderMenuItem,

    _init: function (text, defaultVal, min, max, round, ndec, params) {
        this.parent(text, defaultVal, min, max, round, ndec, params);

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
});

const LoadAverageSliderMenuItem = new Lang.Class({
    Name: 'LoadAverageSliderMenuItem',
    Extends: DoubleSliderMenuItem,

    _init: function (text, valLower, valUpper, min, max, round, ndec, params) {
        this.parent(text, valLower, valUpper, min, max, round, ndec, params);

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
});
