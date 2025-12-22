const { Directory, CompositeDisposable, Disposable } = require("atom");

module.exports = {

  activate() {
    this.disposables = new CompositeDisposable(
      atom.config.observe("scrollmap-git-diff.threshold", (value) => {
        this.threshold = value;
      }),
    );
  },

  deactivate() {
    this.disposables.dispose();
  },

  getDiffs(cache) {
    const repository = cache.get('repository');
    const editorPath = cache.get('editorPath');
    if (!repository || !editorPath) {
      return [];
    }
    const editor = cache.get('editor');
    const buffer = editor.getBuffer();
    if (!buffer || buffer.isDestroyed()) {
      return [];
    }
    const text = buffer.getText();
    return repository.getLineDiffs(editorPath, text) || [];
  },

  provideScrollmap() {
    return {
      name: "git",
      description: "Git diff markers",
      position: "right",
      timer: 100,
      initialize: ({ cache, editor, disposables, update }) => {
        cache.set('editor', editor);
        cache.set('update', update);
        this.subscribeToRepository(cache);
        disposables.add(
          atom.project.onDidChangePaths(() => this.subscribeToRepository(cache)),
          editor.onDidChangePath(() => this.subscribeToRepository(cache)),
          editor.onDidStopChanging(() => {
            cache.set('data', this.getDiffs(cache));
            update();
          }),
          atom.config.onDidChange("scrollmap-git-diff.threshold", update),
          new Disposable(() => cache.get('repoSubs')?.dispose()),
        );
      },
      getItems: ({ editor, cache }) => {
        const items = [];
        for (const diff of cache.get('data') || []) {
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
        if (this.threshold && items.length > this.threshold) {
          return [];
        }
        return items;
      },
    };
  },

  async subscribeToRepository(cache) {
    const repoSubs = cache.get('repoSubs');
    if (repoSubs) {
      repoSubs.dispose();
      cache.set('repoSubs', null);
    }
    const editor = cache.get('editor');
    if (!editor || editor.isDestroyed?.()) {
      return;
    }
    const update = cache.get('update');
    const editorPath = editor.getPath();
    cache.set('editorPath', editorPath);
    if (!editorPath) {
      cache.set('repository', null);
      cache.set('data', []);
      update();
      return;
    }
    const directory = new Directory(editorPath).getParent();
    const repository = await atom.project.repositoryForDirectory(directory);
    cache.set('repository', repository);
    if (repository) {
      cache.set('repoSubs', new CompositeDisposable(
        repository.onDidDestroy(() => this.subscribeToRepository(cache)),
        repository.onDidChangeStatuses(() => {
          cache.set('data', this.getDiffs(cache));
          update();
        }),
        repository.onDidChangeStatus((changedPath) => {
          if (changedPath === cache.get('editorPath')) {
            cache.set('data', this.getDiffs(cache));
            update();
          }
        }),
      ));
    }
    cache.set('data', this.getDiffs(cache));
    update();
  },
};
