const { Directory, CompositeDisposable, Disposable } = require("atom");

module.exports = {

  activate() {
    this.editors = new Map();
  },

  deactivate() {
    this.editors.clear();
  },

  provideScrollmap() {
    const self = this;
    return {
      name: "git",
      timer: 100,
      subscribe: (editor, update) => {
        const ctx = { repository: null, editorPath: null, repoSubs: null, update };
        self.editors.set(editor, ctx);
        self.subscribeToRepository(editor);
        return new CompositeDisposable(
          atom.project.onDidChangePaths(() => self.subscribeToRepository(editor)),
          editor.onDidChangePath(() => self.subscribeToRepository(editor)),
          editor.onDidStopChanging(update),
          new Disposable(() => {
            ctx.repoSubs?.dispose();
            self.editors.delete(editor);
          }),
        );
      },
      recalculate: (editor) => {
        const ctx = self.editors.get(editor);
        if (!ctx?.repository || !ctx.editorPath) {
          return [];
        }
        const buffer = editor.getBuffer();
        if (!buffer || buffer.isDestroyed()) {
          return [];
        }
        const text = buffer.getText();
        const diffs = ctx.repository.getLineDiffs(ctx.editorPath, text);
        if (!diffs) {
          return [];
        }
        const items = [];
        for (const diff of diffs) {
          const { newStart, oldLines, newLines } = diff;
          const startRow = newStart - 1;
          let cls;
          if (oldLines === 0 && newLines > 0) {
            cls = "added";
          } else if (newLines === 0 && oldLines > 0) {
            cls = "removed";
          } else {
            cls = "modified";
          }
          if (newLines > 0) {
            for (let i = 0; i < newLines; i++) {
              items.push({
                row: editor.screenRowForBufferRow(startRow + i),
                cls,
              });
            }
          } else {
            const row = startRow < 0 ? 0 : startRow;
            items.push({
              row: editor.screenRowForBufferRow(row),
              cls,
            });
          }
        }
        return items;
      },
    };
  },

  async subscribeToRepository(editor) {
    const ctx = this.editors.get(editor);
    if (!ctx) {
      return;
    }
    if (ctx.repoSubs) {
      ctx.repoSubs.dispose();
      ctx.repoSubs = null;
    }
    ctx.editorPath = editor.getPath();
    if (!ctx.editorPath) {
      ctx.repository = null;
      ctx.update();
      return;
    }
    const directory = new Directory(ctx.editorPath).getParent();
    ctx.repository = await atom.project.repositoryForDirectory(directory);
    if (ctx.repository) {
      ctx.repoSubs = new CompositeDisposable(
        ctx.repository.onDidDestroy(() => this.subscribeToRepository(editor)),
        ctx.repository.onDidChangeStatuses(() => ctx.update()),
        ctx.repository.onDidChangeStatus((changedPath) => {
          if (changedPath === ctx.editorPath) {
            ctx.update();
          }
        }),
      );
    }
    ctx.update();
  },
};
