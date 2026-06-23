import path from 'node:path';
import { readJsonFile, writeJsonFileAtomic } from '../core/runtime/file-store.mjs';

export class BlogService {
  constructor({ paths }) {
    this.filePath = path.join(paths.runtimeDir, 'blogs.json');
  }

  async listBlogs() {
    try {
      return await readJsonFile(this.filePath);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveBlog({ accountName, blogUrl, blogTitle }) {
    const current = await this.listBlogs();
    const next = [
      ...current.filter(item => item.blogUrl !== blogUrl),
      { accountName: String(accountName || 'default'), blogUrl: String(blogUrl || '').trim(), blogTitle: String(blogTitle || '').trim() }
    ].sort((a, b) => a.blogUrl.localeCompare(b.blogUrl));
    await writeJsonFileAtomic(this.filePath, next);
    return next;
  }
}
