/**
 * Admin Knowledge Base Management
 * - List, create, edit, enable/disable, and delete KB articles
 */
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  FileText,
  Plus,
  Edit,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Filter,
  Tag,
} from 'lucide-react';
import { KnowledgeBaseArticle, KBArticleAudience } from '@/lib/types';

export default function AdminKnowledgeBasePage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [enabledFilter, setEnabledFilter] = useState<string>('all');

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeBaseArticle | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    slug: '',
    title: '',
    content: '',
    category: 'other',
    audience: ['all'] as KBArticleAudience[],
    tags: [] as string[],
    enabled: true,
  });
  const [tagInput, setTagInput] = useState('');

  const loadArticles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (enabledFilter !== 'all') params.append('enabled', enabledFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);

      const res = await fetch(`/api/admin/knowledge-base?${params.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to load articles');
      setArticles(Array.isArray(body?.articles) ? body.articles : []);
    } catch (e: any) {
      toast({ title: 'Failed to load articles', description: e?.message || 'Please try again.', variant: 'destructive' });
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [user, enabledFilter, categoryFilter, toast]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) void loadArticles();
  }, [adminLoading, isAdmin, user, loadArticles]);

  const filteredArticles = useMemo(() => {
    let result = articles;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.content.toLowerCase().includes(query) ||
          a.slug.toLowerCase().includes(query) ||
          a.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    return result;
  }, [articles, searchQuery]);

  const categories = useMemo(() => {
    const cats = new Set(articles.map((a) => a.category));
    return Array.from(cats).sort();
  }, [articles]);

  const openEditDialog = (article: KnowledgeBaseArticle | null) => {
    if (article) {
      setFormData({
        slug: article.slug,
        title: article.title,
        content: article.content,
        category: article.category,
        audience: article.audience,
        tags: article.tags,
        enabled: article.enabled,
      });
      setSelectedArticle(article);
    } else {
      setFormData({
        slug: '',
        title: '',
        content: '',
        category: 'other',
        audience: ['all'],
        tags: [],
        enabled: true,
      });
      setSelectedArticle(null);
    }
    setEditDialogOpen(true);
  };

  const saveArticle = useCallback(async () => {
    if (!user) return;
    if (!formData.slug.trim() || !formData.title.trim() || !formData.content.trim()) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const url = selectedArticle
        ? `/api/admin/knowledge-base/${encodeURIComponent(selectedArticle.slug)}`
        : '/api/admin/knowledge-base';
      const method = selectedArticle ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.error || body?.message || 'Failed to save article');
      }

      toast({ title: 'Success', description: selectedArticle ? 'Article updated.' : 'Article created.' });
      setEditDialogOpen(false);
      await loadArticles();
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [user, formData, selectedArticle, toast, loadArticles]);

  const deleteArticle = useCallback(async () => {
    if (!user || !selectedArticle) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/knowledge-base/${encodeURIComponent(selectedArticle.slug)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.error || body?.message || 'Failed to delete article');
      }

      toast({ title: 'Success', description: 'Article deleted.' });
      setDeleteDialogOpen(false);
      setSelectedArticle(null);
      await loadArticles();
    } catch (e: any) {
      toast({ title: 'Failed to delete', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }, [user, selectedArticle, toast, loadArticles]);

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  }, [tagInput, formData.tags]);

  const removeTag = useCallback(
    (tag: string) => {
      setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
    },
    []
  );

  if (adminLoading) {
    return (
      <PageLoader title="Loading knowledge base…" subtitle="Getting things ready." className="min-h-[300px]" />
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-6">
            <div className="font-semibold">Admin access required</div>
            <div className="text-sm text-muted-foreground mt-1">You don't have access to Knowledge Base management.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold">Knowledge Base</h1>
          </div>
          <p className="text-muted-foreground mt-1">Manage help articles for the AI chat and help center.</p>
        </div>
        <Button onClick={() => openEditDialog(null)} className="min-h-[44px] font-semibold">
          <Plus className="h-4 w-4 mr-2" />
          New Article
        </Button>
      </div>

      <Card className="border-2">
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles by title, content, slug, or tags..."
              className="pl-10"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Category
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Status
              </div>
              <Select value={enabledFilter} onValueChange={setEnabledFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Articles</SelectItem>
                  <SelectItem value="true">Enabled Only</SelectItem>
                  <SelectItem value="false">Disabled Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredArticles.length === 0 ? (
        <Card className="border-2">
          <CardContent className="py-10 text-center">
            <div className="font-extrabold">No articles found</div>
            <div className="text-sm text-muted-foreground mt-1">
              {searchQuery || categoryFilter !== 'all' || enabledFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Create your first article to get started.'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredArticles.map((article) => (
            <Card key={article.id} className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg font-extrabold">{article.title}</CardTitle>
                    <CardDescription className="mt-1">
                      {article.slug} • {article.category} • v{article.version}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {article.enabled ? (
                      <Badge variant="default" className="font-semibold">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-semibold">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {article.audience.map((aud) => (
                    <Badge key={aud} variant="outline" className="text-xs">
                      {aud}
                    </Badge>
                  ))}
                  {article.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <Tag className="h-3 w-3 text-muted-foreground" />
                      {article.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {article.tags.length > 5 && <span className="text-xs text-muted-foreground">+{article.tags.length - 5}</span>}
                    </div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground line-clamp-2">{article.content.slice(0, 200)}...</div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    Updated {article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : '—'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(article)}>
                      <Edit className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedArticle(article);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedArticle ? 'Edit Article' : 'Create New Article'}</DialogTitle>
            <DialogDescription>Manage knowledge base article content and metadata.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  placeholder="getting-started-buying"
                  disabled={!!selectedArticle}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Lowercase, alphanumeric, hyphens only. Cannot be changed after creation.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="getting-started"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="How to Buy on Agchange"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Article content (markdown or plain text)..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Audience *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.audience.includes('buyer')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData((prev) => ({ ...prev, audience: [...prev.audience.filter((a) => a !== 'all'), 'buyer'] }));
                      } else {
                        setFormData((prev) => ({ ...prev, audience: prev.audience.filter((a) => a !== 'buyer') }));
                      }
                    }}
                  />
                  Buyer
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.audience.includes('seller')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData((prev) => ({ ...prev, audience: [...prev.audience.filter((a) => a !== 'all'), 'seller'] }));
                      } else {
                        setFormData((prev) => ({ ...prev, audience: prev.audience.filter((a) => a !== 'seller') }));
                      }
                    }}
                  />
                  Seller
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.audience.includes('all')}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData((prev) => ({ ...prev, audience: ['all'] }));
                      } else {
                        setFormData((prev) => ({ ...prev, audience: prev.audience.filter((a) => a !== 'all') }));
                      }
                    }}
                  />
                  All
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Add
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enabled</Label>
              <Switch id="enabled" checked={formData.enabled} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enabled: checked }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveArticle} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Article'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedArticle?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteArticle} disabled={deleting} className="bg-destructive text-destructive-foreground">
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
