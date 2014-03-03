function CellInfoCollection() {
}

CellInfoCollection.prototype.getInfo = function (cellInfoArr, row, col) {
  for (var i = 0, ilen = cellInfoArr.length; i < ilen; i++) {
    if (cellInfoArr[i].row <= row && cellInfoArr[i].row + cellInfoArr[i].rowspan - 1 >= row && cellInfoArr[i].col <= col && cellInfoArr[i].col + cellInfoArr[i].colspan - 1 >= col) {
      return cellInfoArr[i];
    }
  }
};

CellInfoCollection.prototype.setInfo = function (cellInfoArr, info) {
  for (var i = 0, ilen = cellInfoArr.length; i < ilen; i++) {
    if (cellInfoArr[i].row === info.row && cellInfoArr[i].col === info.col) {
      cellInfoArr[i] = info;
      return;
    }
  }
  cellInfoArr.push(info);
};

CellInfoCollection.prototype.removeInfo = function (cellInfoArr, row, col) {
  for (var i = 0, ilen = cellInfoArr.length; i < ilen; i++) {
    if (cellInfoArr[i].row === row && cellInfoArr[i].col === col) {
      cellInfoArr.splice(i, 1);
      break;
    }
  }
};

/**
 * Plugin used to merge cells in Handsontable
 * @constructor
 */
function MergeCells(instance) {
  this.instance = instance;
  this.mergedCellInfoCollection = new CellInfoCollection();
}

/**
 * @param cellRange (WalkontableCellRange)
 */
MergeCells.prototype.canMergeRange = function (cellRange) {
  //is more than one cell selected
  if (cellRange.isSingle()) {
    return false;
  }

  //is it a valid cell range
  if (!cellRange.isValid(this.instance.view.wt)) {
    return false;
  }

  return true;
};

MergeCells.prototype.mergeRange = function (cellRange) {
  if (!this.canMergeRange(cellRange)) {
    return;
  }

  //normalize top left corner
  var topLeft = cellRange.getTopLeftCorner();
  var bottomRight = cellRange.getBottomRightCorner();

  var mergeParent = {};
  mergeParent.row = topLeft.row;
  mergeParent.col = topLeft.col;
  mergeParent.rowspan = bottomRight.row - topLeft.row + 1; //TD has rowspan == 1 by default. rowspan == 2 means spread over 2 cells
  mergeParent.colspan = bottomRight.col - topLeft.col + 1;
  this.mergedCellInfoCollection.setInfo(this.instance.getSettings().mergeCells, mergeParent);
};

MergeCells.prototype.mergeOrUnmergeSelection = function () {
  var sel = this.instance.getSelected();
  var info = this.mergedCellInfoCollection.getInfo(this.instance.getSettings().mergeCells, sel[0], sel[1]);
  if (info) {
    //unmerge
    this.unmergeSelection();
  }
  else {
    //merge
    this.mergeSelection();
  }
};

MergeCells.prototype.mergeSelection = function () {
  var sel = this.instance.getSelected();
  var cellRange = new WalkontableCellRange(new WalkontableCellCoords(sel[0], sel[1]), new WalkontableCellCoords(sel[2], sel[3]));
  this.mergeRange(cellRange);
  this.instance.render();
};

MergeCells.prototype.unmergeSelection = function () {
  var sel = this.instance.getSelected();
  var info = this.mergedCellInfoCollection.getInfo(this.instance.getSettings().mergeCells, sel[0], sel[1]);
  this.mergedCellInfoCollection.removeInfo(this.instance.getSettings().mergeCells, info.row, info.col);
  this.instance.render();
};

MergeCells.prototype.applySpanProperties = function (TD, row, col) {
  var info = this.mergedCellInfoCollection.getInfo(this.instance.getSettings().mergeCells, row, col);
  if (info) {
    if (info.row === row && info.col === col) {
      TD.setAttribute('rowspan', info.rowspan);
      TD.setAttribute('colspan', info.colspan);
    }
    else {
      TD.style.display = "none";
    }
  }
  else {
    TD.removeAttribute('rowspan');
    TD.removeAttribute('colspan');
  }
};

if (typeof Handsontable !== 'undefined') {
  var init = function () {
    var instance = this;
    var mergeCellsSetting = instance.getSettings().mergeCells;

    //mergeCellsSetting = true;

    if (mergeCellsSetting) {
      if (!instance.mergeCells) {
        instance.mergeCells = new MergeCells(instance);
      }
    }
  };

  Handsontable.PluginHooks.add('beforeInit', init);

  var onBeforeKeyDown = function (event) {
    if (!this.mergeCells) {
      return;
    }

    var ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

    if (ctrlDown) {
      if (event.keyCode === 77) { //CTRL + M
        this.mergeCells.mergeOrUnmergeSelection();
        event.stopImmediatePropagation();
      }
    }
  };

  Handsontable.PluginHooks.add('beforeKeyDown', onBeforeKeyDown);


  Handsontable.PluginHooks.add('afterContextMenuDefaultOptions', function (defaultOptions) {
    if (!this.getSettings().mergeCells) {
      return;
    }

    defaultOptions.items.mergeCellsSeparator = Handsontable.ContextMenu.SEPARATOR;

    defaultOptions.items.mergeCells = {
      name: function () {
        var sel = this.getSelected();
        var info = this.mergeCells.mergedCellInfoCollection.getInfo(this.getSettings().mergeCells, sel[0], sel[1]);
        if (info) {
          return 'Unmerge cells';
        }
        else {
          return 'Merge cells';
        }
      },
      callback: function () {
        this.mergeCells.mergeOrUnmergeSelection();
      },
      disabled: function () {
        return false;
      }
    };
  });

  Handsontable.PluginHooks.add('afterRenderer', function (TD, row, col, prop, value, cellProperties) {
    if (this.mergeCells) {
      this.mergeCells.applySpanProperties(TD, row, col);
    }
  });

  var beforeInit = function () {
    var mergeCells = this.getSettings().mergeCells;
    if (mergeCells) {
      if (mergeCells === true) {
        this.getSettings().mergeCells = [];
      }
    }
  };

  var modifyTransformFactory = function (hook) {
    return function (delta) {
      var mergeCellsSetting = this.getSettings().mergeCells;
      if (mergeCellsSetting) {
        var selRange = this.getSelectedRange();
        var current;
        switch (hook) {
          case 'modifyTransformStartRow':
          case 'modifyTransformStartCol':
            current = selRange.from;
            break;

          case 'modifyTransformEndRow':
          case 'modifyTransformEndCol':
            current = selRange.to;
            break;
        }
        var mergeParent = this.mergeCells.mergedCellInfoCollection.getInfo(mergeCellsSetting, current.row, current.col);
        if (mergeParent) {
          switch (hook) {
            case 'modifyTransformStartRow':
            case 'modifyTransformEndRow':
              if (delta > 0) {
                return mergeParent.row - current.row + mergeParent.rowspan - 1 + delta;
              }
              else if (delta < 0) {
                return mergeParent.row - current.row + delta;
              }
              break;

            case 'modifyTransformStartCol':
            case 'modifyTransformEndCol':
              if (delta > 0) {
                return mergeParent.col - current.col + mergeParent.colspan - 1 + delta;
              }
              else if (delta < 0) {
                return mergeParent.col - current.col + delta;
              }
              break;
          }
        }
      }
      return delta;
    }
  };

  var afterSelection = function (fromRow, fromCol, toRow, toCol) {
    var mergeCellsSetting = this.getSettings().mergeCells;
    if (mergeCellsSetting) {
      var selRange = this.getSelectedRange();
      var fromInfo = this.mergeCells.mergedCellInfoCollection.getInfo(mergeCellsSetting, selRange.from.row, selRange.from.col);
      if (fromInfo) {
        var newFromCellCoords = new WalkontableCellCoords(fromInfo.row, fromInfo.col);
        this.view.wt.selections.current.replace(selRange.from, newFromCellCoords);
        this.view.wt.selections.area.replace(selRange.from, newFromCellCoords);
        this.view.wt.selections.highlight.replace(selRange.from, newFromCellCoords);
      }
      var toInfo = this.mergeCells.mergedCellInfoCollection.getInfo(mergeCellsSetting, selRange.to.row, selRange.to.col);
      if (toInfo) {
        var newToCellCoords = new WalkontableCellCoords(toInfo.row, toInfo.col);
        this.view.wt.selections.current.replace(selRange.to, newToCellCoords);
        this.view.wt.selections.area.replace(selRange.to, newToCellCoords);
        this.view.wt.selections.highlight.replace(selRange.to, newToCellCoords);
      }
    }
  };

  Handsontable.PluginHooks.add('beforeInit', beforeInit);
  Handsontable.PluginHooks.add('modifyTransformStartRow', modifyTransformFactory('modifyTransformStartRow'));
  Handsontable.PluginHooks.add('modifyTransformStartCol', modifyTransformFactory('modifyTransformStartCol'));
  Handsontable.PluginHooks.add('modifyTransformEndRow', modifyTransformFactory('modifyTransformEndRow'));
  Handsontable.PluginHooks.add('modifyTransformEndCol', modifyTransformFactory('modifyTransformEndCol'));
  Handsontable.PluginHooks.add('afterSelection', afterSelection);

  Handsontable.MergeCells = MergeCells;
}