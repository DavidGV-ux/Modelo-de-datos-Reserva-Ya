import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoMeta {
  title?: string;
  description?: string;
  image?: string;
  type?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  setPageMeta(meta: SeoMeta): void {
    if (meta.title) {
      this.title.setTitle(meta.title);
      this.meta.updateTag({ property: 'og:title', content: meta.title });
    }
    if (meta.description) {
      this.meta.updateTag({ name: 'description', content: meta.description });
      this.meta.updateTag({ property: 'og:description', content: meta.description });
    }
    if (meta.image) {
      this.meta.updateTag({ property: 'og:image', content: meta.image });
    }
    if (meta.type) {
      this.meta.updateTag({ property: 'og:type', content: meta.type });
    }
  }
}