"""
Import markdown event/category files into MongoDB.

Run with: python api/scripts/import_md.py --uri mongodb://localhost:27017/saturnalia
"""
import os
import argparse
from pymongo import MongoClient


def discover_md(root):
    items = []
    for dirpath, dirnames, filenames in os.walk(root):
        for f in filenames:
            if f.endswith('.md'):
                items.append(os.path.join(dirpath, f))
    return items


def parse_title_from_md(path):
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line.startswith('#'):
                return line.lstrip('#').strip()
    return os.path.splitext(os.path.basename(path))[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--uri', default=os.environ.get('MONGO_URI', 'mongodb://localhost:27017/saturnalia'))
    parser.add_argument('--content', default='..')
    args = parser.parse_args()

    client = MongoClient(args.uri)
    db = client.get_default_database()
    events = db.events
    categories = db.categories

    # We'll treat top-level folders in the repo root (one level up) as categories
    content_root = os.path.abspath(args.content)
    category_ids = {}
    
    for entry in os.listdir(content_root):
        p = os.path.join(content_root, entry)
        if os.path.isdir(p) and entry not in ['.git', '.github', '.vscode', 'node_modules', 'api', 'public', 'policies']:
            # create or update main category
            slug = entry
            title = entry.replace('-', ' ').title()
            result = categories.update_one(
                {'slug': slug, 'parent_id': None}, 
                {'$set': {'title': title, 'slug': slug, 'description': f'{title} events and competitions.'}}, 
                upsert=True
            )
            
            # Get category ID for subcategory relationships
            category_doc = categories.find_one({'slug': slug, 'parent_id': None})
            category_ids[slug] = category_doc['_id']
            
            # Check for subcategories (subdirectories)
            for subentry in os.listdir(p):
                subp = os.path.join(p, subentry)
                if os.path.isdir(subp) and not subentry.startswith('.'):
                    # This is a subcategory
                    sub_slug = subentry
                    sub_title = subentry.replace('-', ' ').title()
                    categories.update_one(
                        {'slug': sub_slug, 'parent_id': category_ids[slug]},
                        {'$set': {
                            'title': sub_title, 
                            'slug': sub_slug, 
                            'parent_id': category_ids[slug],
                            'description': f'{sub_title} events.'
                        }}, 
                        upsert=True
                    )
                    
                    # Process events in subcategory
                    for root, dirs, files in os.walk(subp):
                        for f in files:
                            if f.endswith('.md') and f != 'index.md':
                                full = os.path.join(root, f)
                                rel = os.path.relpath(full, content_root)
                                title = parse_title_from_md(full)
                                with open(full, encoding='utf-8') as fh:
                                    md = fh.read()
                                slug_ev = os.path.splitext(f)[0]
                                doc = {
                                    'title': title,
                                    'slug': slug_ev,
                                    'category_slug': slug,
                                    'subcategory_slug': sub_slug,
                                    'path': rel.replace('\\', '/'),
                                    'markdown': md
                                }
                                events.update_one({'path': doc['path']}, {'$set': doc}, upsert=True)
            
            # Process events directly in main category (not in subcategories)
            for f in os.listdir(p):
                if f.endswith('.md') and f != 'index.md':
                    full = os.path.join(p, f)
                    if os.path.isfile(full):
                        rel = os.path.relpath(full, content_root)
                        title = parse_title_from_md(full)
                        with open(full, encoding='utf-8') as fh:
                            md = fh.read()
                        slug_ev = os.path.splitext(f)[0]
                        doc = {
                            'title': title,
                            'slug': slug_ev,
                            'category_slug': slug,
                            'path': rel.replace('\\', '/'),
                            'markdown': md
                        }
                        events.update_one({'path': doc['path']}, {'$set': doc}, upsert=True)

    print('Import complete')


if __name__ == '__main__':
    main()
