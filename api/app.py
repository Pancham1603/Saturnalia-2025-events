from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from pymongo import MongoClient
from bson.objectid import ObjectId
import markdown
import os
from datetime import datetime
import requests
import json
from urllib.parse import urlencode
from functools import wraps
from dotenv import load_dotenv
import shutil
import re
import subprocess
from flask_cors import CORS

# load local .env if present
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__, template_folder=os.path.join(os.path.dirname(__file__), '.', 'templates'), static_folder=os.path.join(os.path.dirname(__file__), '.', 'static'))
# Secret key for session
app.secret_key = os.environ.get('FLASK_SECRET', 'dev-secret-change-me')

# MongoDB setup
MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://mongo:27017')
MONGO_DB = os.environ.get('MONGO_DATABASE', 'saturnalia')
client = MongoClient(MONGO_URI)
db = client[MONGO_DB]

# Enable CORS
CORS(app, supports_credentials=True)

logs_col = db.crud_logs
users_col = db.users

def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not current_user():
            # For API requests, return JSON error
            if request.path.startswith('/api/'):
                return jsonify({'error': 'unauthorized'}), 401
            # For web requests, redirect to login
            return redirect(url_for('landing'))
        return f(*args, **kwargs)
    return wrapped

def admin_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify({'error': 'unauthorized'}), 401
        if not (u.get('is_admin') or u.get('is_superuser')):
            return jsonify({'error': 'forbidden'}), 403
        return f(*args, **kwargs)
    return wrapped


def superuser_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify({'error': 'unauthorized'}), 401
        if not u.get('is_superuser'):
            return jsonify({'error': 'forbidden - superuser access required'}), 403
        return f(*args, **kwargs)
    return wrapped


def log_action(action, collection, doc_id=None, data=None, user=None):
    # Serialize data to handle ObjectIds
    serialized_data = serialize_doc(data) if data else None
    
    logs_col.insert_one({
        'action': action,
        'collection': collection,
        'doc_id': str(doc_id) if doc_id else None,
        'data': serialized_data,
        'user': user,
        'timestamp': datetime.utcnow()
    })


def load_google_config():
    # Look for a local google_config.json, otherwise use env vars
    cfg_path = os.path.join(os.path.dirname(__file__), 'google_config.json')
    if os.path.exists(cfg_path):
        with open(cfg_path, 'r', encoding='utf-8') as fh:
            raw = json.load(fh)
            # Normalize keys
            web = raw.get('web') or raw
            return {
                'client_id': web.get('client_id'),
                'client_secret': web.get('client_secret'),
                'auth_uri': web.get('auth_uri', 'https://accounts.google.com/o/oauth2/v2/auth'),
                'token_uri': web.get('token_uri', 'https://oauth2.googleapis.com/token'),
                'userinfo_uri': web.get('userinfo_uri', 'https://www.googleapis.com/oauth2/v3/userinfo')
            }
    # fallback to env
    return {
        'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
        'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
        'auth_uri': os.environ.get('GOOGLE_AUTH_URI', 'https://accounts.google.com/o/oauth2/v2/auth'),
        'token_uri': os.environ.get('GOOGLE_TOKEN_URI', 'https://oauth2.googleapis.com/token'),
        'userinfo_uri': os.environ.get('GOOGLE_USERINFO_URI', 'https://www.googleapis.com/oauth2/v3/userinfo')
    }


google_cfg = load_google_config()

# VitePress content management functions
CONTENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
# Path to VitePress docs root (adjust if needed)
VITEPRESS_ROOT = CONTENT_ROOT

@admin_required
def rebuild_vitepress_docs():
    """Run VitePress build to update static docs after changes."""
    try:
        # Get npm path from environment variable, fallback to 'npm'
        npm_path = os.environ.get('NPM_PATH', 'npm')
        
        # Set up environment variables for Node.js
        env = os.environ.copy()
        
        # Add Node.js paths if specified
        if 'NODE_PATH' in os.environ:
            env['NODE_PATH'] = os.environ['NODE_PATH']
        
        # Ensure PATH includes Node.js binaries
        node_bin_path = os.environ.get('NODE_BIN_PATH')
        if node_bin_path:
            env['PATH'] = f"{node_bin_path}:{env.get('PATH', '')}"
        
        result = subprocess.run(
            [npm_path, "run", "build"],
            cwd=VITEPRESS_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            env=env
        )
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr
    except Exception as e:
        return False, str(e)

def current_user():
    u = session.get('user')
    user = users_col.find_one({'email': u['email']}) if u else None
    if user:
        return {
            'email': user['email'],
            'name': user.get('name'),
            'is_admin': user.get('is_admin', False),
            'is_superuser': user.get('is_superuser', False)
        }


def get_current_user_email():
    u = current_user()
    return u.get('email') if u else None


def serialize_doc(doc):
    """Convert MongoDB document ObjectIds to strings for JSON serialization"""
    if not doc:
        return doc
    if isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    if isinstance(doc, dict):
        serialized = {}
        for key, value in doc.items():
            if key == '_id':
                serialized['id'] = str(value)
            elif hasattr(value, '__class__') and value.__class__.__name__ == 'ObjectId':
                serialized[key] = str(value)
            elif isinstance(value, (dict, list)):
                serialized[key] = serialize_doc(value)
            else:
                serialized[key] = value
        return serialized
    return doc


@app.route('/')
def landing():
    # Check if user is logged in, redirect to portal if so
    if current_user():
        return redirect(url_for('portal'))
    return render_template('login.html')

@app.route('/portal')
@login_required
def portal():
    return render_template('portal.html')

@app.route('/editor')
@admin_required
def editor():
    return render_template('editor.html')

@app.route('/logs')
@admin_required
def logs():
    return render_template('logs.html')

@app.route('/users')
@admin_required
def users():
    return render_template('users.html')

@app.route('/filemanager')
@admin_required
def filemanager():
    return render_template('filemanager.html')

@app.route('/recently-deleted')
@admin_required
def recently_deleted():
    return render_template('recently-deleted.html')


@app.route('/auth/google')
def google_auth():
    # build redirect to Google's OAuth 2.0 server
    redirect_uri = url_for('google_callback', _external=True)
    params = {
        'scope': 'profile email',
        'access_type': 'offline',
        'prompt': 'consent',
        'include_granted_scopes': 'true',
        'response_type': 'code',
        'redirect_uri': redirect_uri,
        'client_id': google_cfg['client_id'],
    }
    auth_uri = google_cfg.get('auth_uri')
    return redirect(f"{auth_uri}?{urlencode(params)}")


@app.route('/auth/google/callback')
def google_callback():
    if 'error' in request.args:
        return jsonify({'error': 'access_denied'}), 400
    if 'code' not in request.args:
        return jsonify({'error': 'missing_code'}), 400
    code = request.args.get('code')
    token_endpoint = google_cfg.get('token_uri')
    redirect_uri = url_for('google_callback', _external=True)
    post_data = {
        'code': code,
        'client_id': google_cfg.get('client_id'),
        'client_secret': google_cfg.get('client_secret'),
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code'
    }
    # exchange code for tokens
    token_resp = requests.post(token_endpoint, data=post_data)
    if not token_resp.ok:
        return jsonify({'error': 'token_exchange_failed'}), 502
    token_json = token_resp.json()
    access_token = token_json.get('access_token')
    # fetch userinfo
    userinfo_resp = requests.get(google_cfg.get('userinfo_uri'), headers={'Authorization': f'Bearer {access_token}'})
    if not userinfo_resp.ok:
        return jsonify({'error': 'userinfo_failed'}), 502
    info = userinfo_resp.json()
    email = info.get('email')
    name = info.get('name') or info.get('email')

    # Upsert user in users collection
    users = db.users
    user_doc = users.find_one({'email': email})
    if not user_doc:
        # default: non-admin, non-superuser. These flags can be set manually in DB or via API.
        users.insert_one({
            'email': email, 
            'name': name, 
            'is_admin': False, 
            'is_superuser': False,
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow()
        })
        user_doc = users.find_one({'email': email})
    else:
        # Update last login time
        users.update_one({'email': email}, {'$set': {'last_login': datetime.utcnow()}})

    # store minimal session
    session['user'] = {
        'email': user_doc['email'], 
        'name': user_doc.get('name'), 
        'is_admin': user_doc.get('is_admin', False),
        'is_superuser': user_doc.get('is_superuser', False)
    }
    log_action('login', 'users', doc_id=user_doc.get('_id'), user=session['user']['email'])
    return redirect(url_for('portal'))


@app.route('/auth/logout')
def logout():
    user_email = get_current_user_email()
    session.pop('user', None)
    log_action('logout', 'users', user=user_email)
    return redirect(url_for('portal'))


@app.route('/api/me')
def whoami():
    u = current_user()
    if u:
        # Create a copy and rename fields to match frontend expectations
        user_data = u.copy()
        user_data['admin'] = user_data.get('is_admin', False)
        user_data['superuser'] = user_data.get('is_superuser', False)
        return jsonify(user_data)
    return jsonify({})


@app.route('/api/logs', methods=['GET'])
@admin_required
def get_logs():
    logs = list(logs_col.find().sort('timestamp', -1).limit(200))
    out = []
    for l in logs:
        log_entry = {
            'id': str(l.get('_id')),
            'action': l.get('action'),
            'collection': l.get('collection'),
            'doc_id': l.get('doc_id'),
            'user': l.get('user'),
            'timestamp': l.get('timestamp').isoformat() if l.get('timestamp') else None
        }
        
        # Handle data field - ensure any ObjectIds are converted to strings
        data = l.get('data')
        if data and isinstance(data, dict):
            # Create a copy to avoid modifying the original
            data_copy = data.copy()
            for key, value in data_copy.items():
                if hasattr(value, '__class__') and value.__class__.__name__ == 'ObjectId':
                    data_copy[key] = str(value)
            log_entry['data'] = data_copy
        else:
            log_entry['data'] = data
            
        out.append(log_entry)
    return jsonify(out)


# User Management Endpoints (Superuser only)
@app.route('/users')
@admin_required
def user_management():
    return render_template('users.html')


@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    users = list(users_col.find({}, {'_id': 1, 'email': 1, 'name': 1, 'is_admin': 1, 'is_superuser': 1, 'created_at': 1, 'last_login': 1}))
    for user in users:
        user['id'] = str(user.pop('_id'))
        # Rename fields to match frontend expectations
        user['admin'] = user.pop('is_admin', False)
        user['superuser'] = user.pop('is_superuser', False)
        # Convert datetime objects to ISO format for JSON serialization
        if user.get('created_at'):
            user['created_at'] = user['created_at'].isoformat()
        if user.get('last_login'):
            user['last_login'] = user['last_login'].isoformat()
    return jsonify(users)


@app.route('/api/users/<user_id>/admin', methods=['POST'])
@superuser_required
def toggle_admin_status(user_id):
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({'error': 'invalid user id'}), 400
    
    data = request.get_json()
    if 'admin' not in data:
        return jsonify({'error': 'admin field required'}), 400
    
    is_admin = bool(data['admin'])
    
    # Prevent superusers from removing their own admin status
    current_user_obj = current_user()
    target_user = users_col.find_one({'_id': oid})
    if not target_user:
        return jsonify({'error': 'user not found'}), 404
    
    if current_user_obj['email'] == target_user['email'] and not is_admin:
        return jsonify({'error': 'Cannot remove admin status from yourself'}), 400
    
    result = users_col.update_one({'_id': oid}, {'$set': {'is_admin': is_admin}})
    if result.matched_count == 0:
        return jsonify({'error': 'user not found'}), 404
    
    log_action('admin_toggle', 'users', doc_id=user_id, 
               data={'is_admin': is_admin, 'target_email': target_user['email']}, 
               user=get_current_user_email())
    
    return jsonify({'message': f'User admin status updated to {is_admin}'})


@app.route('/api/users/<user_id>/superuser', methods=['POST'])
@superuser_required
def toggle_superuser_status(user_id):
    try:
        oid = ObjectId(user_id)
    except Exception:
        return jsonify({'error': 'invalid user id'}), 400
    
    data = request.get_json()
    if 'superuser' not in data:
        return jsonify({'error': 'superuser field required'}), 400
    
    is_superuser = bool(data['superuser'])
    
    # Prevent superusers from removing their own superuser status
    current_user_obj = current_user()
    target_user = users_col.find_one({'_id': oid})
    if not target_user:
        return jsonify({'error': 'user not found'}), 404
    
    if current_user_obj['email'] == target_user['email'] and not is_superuser:
        return jsonify({'error': 'Cannot remove superuser status from yourself'}), 400
    
    result = users_col.update_one({'_id': oid}, {'$set': {'is_superuser': is_superuser}})
    if result.matched_count == 0:
        return jsonify({'error': 'user not found'}), 404
    
    log_action('superuser_toggle', 'users', doc_id=user_id, 
               data={'is_superuser': is_superuser, 'target_email': target_user['email']}, 
               user=get_current_user_email())
    
    return jsonify({'message': f'User superuser status updated to {is_superuser}'})


# File System Management Endpoints

@app.route('/api/filesystem/browse', methods=['GET'])
@admin_required
def browse_filesystem():
    """Browse the VitePress file structure"""
    try:
        path = request.args.get('path', '')
        # Sanitize path to prevent directory traversal
        if '..' in path or path.startswith('/') or '\\' in path:
            return jsonify({'error': 'Invalid path'}), 400
        
        full_path = os.path.join(CONTENT_ROOT, path) if path else CONTENT_ROOT
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'Path not found'}), 404
        
        if not os.path.isdir(full_path):
            return jsonify({'error': 'Path is not a directory'}), 400
        
        items = []
        try:
            for item in sorted(os.listdir(full_path)):
                # Skip hidden and system files, but allow .vitepress, also skip recently_deleted
                if (item.startswith('.') and item != '.vitepress') or item in ['api', 'node_modules', 'dist', 'recently_deleted']:
                    continue
                
                item_path = os.path.join(full_path, item)
                relative_path = os.path.join(path, item).replace('\\', '/') if path else item
                
                # Check if we're inside .vitepress folder - if so, allow all files
                is_inside_vitepress = path.startswith('.vitepress') or path.startswith('.vitepress/')
                
                is_directory = os.path.isdir(item_path)
                
                if is_inside_vitepress:
                    # Inside .vitepress folder - allow all files and directories
                    pass  # No filtering needed
                else:
                    # Outside .vitepress folder - only allow directories, .md files, and specific VitePress config files
                    is_markdown = not is_directory and item.lower().endswith('.md')
                    is_vitepress_config = not is_directory and (
                        item.lower() in ['config.js', 'config.ts', 'config.mjs', 'config.json'] or
                        item.lower().endswith('.vue') or
                        item.lower() == 'package.json'
                    )
                    is_vitepress_dir = is_directory and item == '.vitepress'
                    
                    if not (is_directory or is_markdown or is_vitepress_config or is_vitepress_dir):
                        continue
                
                item_info = {
                    'name': item,
                    'path': relative_path,
                    'is_directory': is_directory,
                    'size': os.path.getsize(item_path) if os.path.isfile(item_path) else 0,
                    'modified': datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat()
                }
                
                if item_info['is_directory']:
                    # Count files in directory
                    try:
                        if is_inside_vitepress or item == '.vitepress':
                            # Inside or is .vitepress folder - count all files
                            file_count = len([f for f in os.listdir(item_path) 
                                            if not f.startswith('.') and os.path.isfile(os.path.join(item_path, f))])
                        else:
                            # Outside .vitepress folder - count only allowed files
                            def is_allowed_file(f):
                                if f.startswith('.'):
                                    return f == '.vitepress'
                                return (f.lower().endswith('.md') or 
                                       f.lower() in ['config.js', 'config.ts', 'config.mjs', 'config.json'] or
                                       f.lower().endswith('.vue') or
                                       f.lower() == 'package.json')
                            
                            file_count = len([f for f in os.listdir(item_path) 
                                            if is_allowed_file(f) and os.path.isfile(os.path.join(item_path, f))])
                        item_info['file_count'] = file_count
                    except:
                        item_info['file_count'] = 0
                else:
                    # Get file extension
                    item_info['extension'] = os.path.splitext(item)[1].lower()
                
                items.append(item_info)
        except PermissionError:
            return jsonify({'error': 'Permission denied'}), 403
        
        return jsonify({
            'current_path': path,
            'items': items,
            'parent_path': os.path.dirname(path).replace('\\', '/') if path else None
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to browse filesystem: {str(e)}'}), 500

@app.route('/api/filesystem/recently-deleted', methods=['GET'])
@admin_required
def browse_recently_deleted():
    """Browse files in the recently_deleted folder"""
    try:
        recently_deleted_path = os.path.join(CONTENT_ROOT, 'recently_deleted')
        
        if not os.path.exists(recently_deleted_path):
            return jsonify({
                'items': [],
                'count': 0,
                'message': 'No deleted files found'
            })
        
        items = []
        for item in os.listdir(recently_deleted_path):
            item_path = os.path.join(recently_deleted_path, item)
            
            if os.path.isfile(item_path):
                # Parse timestamp from filename (format: YYYYMMDD_HHMMSS_originalname)
                original_name = item
                deleted_date = None
                if '_' in item:
                    parts = item.split('_', 2)
                    if len(parts) >= 3:
                        try:
                            date_part = parts[0]
                            time_part = parts[1]
                            original_name = parts[2]
                            
                            # Parse timestamp
                            timestamp_str = f"{date_part}_{time_part}"
                            deleted_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S').isoformat()
                        except ValueError:
                            pass
                
                items.append({
                    'name': item,
                    'original_name': original_name,
                    'path': f'recently_deleted/{item}',
                    'is_directory': False,
                    'size': os.path.getsize(item_path),
                    'modified': datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat(),
                    'deleted_date': deleted_date or datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat(),
                    'extension': os.path.splitext(item)[1].lower()
                })
        
        # Sort by deletion date (newest first)
        items.sort(key=lambda x: x['deleted_date'], reverse=True)
        
        return jsonify({
            'items': items,
            'count': len(items)
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to browse recently deleted files: {str(e)}'}), 500

@app.route('/api/filesystem/restore', methods=['POST'])
@admin_required
def restore_file():
    """Restore a file from recently_deleted folder"""
    try:
        data = request.get_json()
        deleted_filename = data.get('deleted_filename')
        original_name = data.get('original_name')
        
        if not deleted_filename or not original_name:
            return jsonify({'error': 'Deleted filename and original name are required'}), 400
        
        # Paths
        recently_deleted_path = os.path.join(CONTENT_ROOT, 'recently_deleted')
        deleted_file_path = os.path.join(recently_deleted_path, deleted_filename)
        restore_file_path = os.path.join(CONTENT_ROOT, original_name)
        
        # Check if deleted file exists
        if not os.path.exists(deleted_file_path):
            return jsonify({'error': 'Deleted file not found'}), 404
        
        # Check if restore location already has a file with same name
        if os.path.exists(restore_file_path):
            return jsonify({'error': f'A file named "{original_name}" already exists at the restore location'}), 409
        
        # Create directories if needed
        restore_dir = os.path.dirname(restore_file_path)
        if restore_dir and not os.path.exists(restore_dir):
            os.makedirs(restore_dir, exist_ok=True)
        
        # Move file back to original location
        shutil.move(deleted_file_path, restore_file_path)
        # Trigger VitePress rebuild
        success, output = rebuild_vitepress_docs()
        return jsonify({'message': f'File "{original_name}" restored successfully', 'vitepress_rebuild': success, 'vitepress_output': output})
        
    except Exception as e:
        return jsonify({'error': f'Failed to restore file: {str(e)}'}), 500

@app.route('/api/filesystem/delete-permanent', methods=['DELETE'])
@superuser_required
def delete_permanent():
    """Permanently delete a file from recently_deleted folder"""
    try:
        data = request.get_json()
        deleted_filename = data.get('deleted_filename')
        
        if not deleted_filename:
            return jsonify({'error': 'Deleted filename is required'}), 400
        
        # Path to file in recently_deleted folder
        recently_deleted_path = os.path.join(CONTENT_ROOT, 'recently_deleted')
        file_path = os.path.join(recently_deleted_path, deleted_filename)
        
        # Check if file exists
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found in recently deleted'}), 404
        
        # Permanently delete the file
        os.remove(file_path)
        
        return jsonify({'message': 'File permanently deleted'})
        
    except Exception as e:
        return jsonify({'error': f'Failed to permanently delete file: {str(e)}'}), 500

@app.route('/api/filesystem/read', methods=['GET'])
@admin_required
def read_file_content():
    """Read content of a markdown file"""
    try:
        file_path = request.args.get('path', '')
        if not file_path:
            return jsonify({'error': 'File path required'}), 400
        
        # Sanitize path
        if '..' in file_path or file_path.startswith('/') or '\\' in file_path:
            return jsonify({'error': 'Invalid file path'}), 400
        
        full_path = os.path.join(CONTENT_ROOT, file_path)
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'File not found'}), 404
        
        if not os.path.isfile(full_path):
            return jsonify({'error': 'Path is not a file'}), 400
        
        # Check file reading permissions
        is_inside_vitepress = file_path.startswith('.vitepress/') or file_path.startswith('.vitepress\\')
        is_inside_recently_deleted = file_path.startswith('recently_deleted/') or file_path.startswith('recently_deleted\\')
        
        if is_inside_recently_deleted:
            # Inside recently_deleted folder - prevent reading/editing
            return jsonify({'error': 'Files in recently_deleted folder cannot be accessed'}), 403
        elif is_inside_vitepress:
            # Inside .vitepress folder - allow reading all files
            pass
        else:
            # Outside .vitepress folder - only allow .md files and specific VitePress config files
            filename = os.path.basename(file_path).lower()
            is_allowed = (file_path.lower().endswith('.md') or 
                         filename in ['config.js', 'config.ts', 'config.mjs', 'config.json', 'package.json'] or
                         filename.endswith('.vue'))
            if not is_allowed:
                return jsonify({'error': 'Only markdown and VitePress configuration files can be read'}), 403
        
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(full_path, 'r', encoding='latin-1') as f:
                    content = f.read()
            except:
                return jsonify({'error': 'Unable to read file - unsupported encoding'}), 400
        
        file_info = {
            'path': file_path,
            'name': os.path.basename(file_path),
            'content': content,
            'size': os.path.getsize(full_path),
            'modified': datetime.fromtimestamp(os.path.getmtime(full_path)).isoformat(),
            'extension': os.path.splitext(file_path)[1].lower()
        }
        
        return jsonify(file_info)
        
    except Exception as e:
        return jsonify({'error': f'Failed to read file: {str(e)}'}), 500

@app.route('/api/filesystem/write', methods=['POST'])
@admin_required
def write_file_content():
    """Write content to a markdown file"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        file_path = data.get('path', '')
        content = data.get('content', '')
        
        if not file_path:
            return jsonify({'error': 'File path required'}), 400
        
        # Sanitize path
        if '..' in file_path or file_path.startswith('/') or '\\' in file_path:
            return jsonify({'error': 'Invalid file path'}), 400
        
        full_path = os.path.join(CONTENT_ROOT, file_path)
        
        # Check file writing permissions
        is_inside_vitepress = file_path.startswith('.vitepress/') or file_path.startswith('.vitepress\\')
        is_inside_recently_deleted = file_path.startswith('recently_deleted/') or file_path.startswith('recently_deleted\\')
        
        if is_inside_recently_deleted:
            # Inside recently_deleted folder - prevent writing/editing
            return jsonify({'error': 'Files in recently_deleted folder cannot be modified'}), 403
        elif is_inside_vitepress:
            # Inside .vitepress folder - allow writing all files
            pass
        else:
            # Outside .vitepress folder - only allow .md files and specific VitePress config files
            filename = os.path.basename(file_path).lower()
            is_allowed = (file_path.lower().endswith('.md') or 
                         filename in ['config.js', 'config.ts', 'config.mjs', 'config.json', 'package.json'] or
                         filename.endswith('.vue'))
            if not is_allowed:
                return jsonify({'error': 'Only markdown and VitePress configuration files can be written'}), 403
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Backup original file if it exists
        backup_created = False
        if os.path.exists(full_path):
            backup_path = full_path + '.backup'
            try:
                shutil.copy2(full_path, backup_path)
                backup_created = True
            except:
                pass  # Backup failed, but continue
        
        try:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            # Restore from backup if write failed
            if backup_created and os.path.exists(backup_path):
                try:
                    shutil.copy2(backup_path, full_path)
                except:
                    pass
            raise e
        
        # Clean up backup file
        if backup_created:
            try:
                backup_path = full_path + '.backup'
                if os.path.exists(backup_path):
                    os.remove(backup_path)
            except:
                pass
        
        # Log the action
        log_action('write_file', 'filesystem', data={'path': file_path, 'size': len(content)}, 
                  user=get_current_user_email())
        
        return jsonify({
            'status': 'success',
            'path': file_path,
            'size': len(content),
            'modified': datetime.now().isoformat()
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to write file: {str(e)}'}), 500

@app.route('/api/filesystem/create', methods=['POST'])
@admin_required
def create_file_or_directory():
    """Create a new file or directory"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        path = data.get('path', '')
        name = data.get('name', '')
        is_directory = data.get('is_directory', False)
        content = data.get('content', '')
        
        if path is None or not name:
            return jsonify({'error': 'Path and name required'}), 400
        
        # Sanitize inputs
        if '..' in path or path.startswith('/') or '\\' in path:
            return jsonify({'error': 'Invalid path'}), 400
        
        if '..' in name or '/' in name or '\\' in name:
            return jsonify({'error': 'Invalid name'}), 400
        
        # Check if trying to create inside recently_deleted folder
        current_path = path if path else ''
        is_inside_recently_deleted = current_path.startswith('recently_deleted') or current_path.startswith('recently_deleted/')
        
        if is_inside_recently_deleted:
            return jsonify({'error': 'Cannot create files inside recently_deleted folder'}), 403
        
        full_path = os.path.join(CONTENT_ROOT, path, name)
        
        if os.path.exists(full_path):
            return jsonify({'error': 'File or directory already exists'}), 400
        
        try:
            if is_directory:
                os.makedirs(full_path, exist_ok=True)
                action_type = 'create_directory'
            else:
                # Check file creation permissions
                current_path = path if path else ''
                is_inside_vitepress = current_path.startswith('.vitepress') or current_path.startswith('.vitepress/')
                
                if not is_inside_vitepress:
                    # Outside .vitepress folder - only allow creating markdown files
                    if not name.lower().endswith('.md'):
                        return jsonify({'error': 'Only markdown (.md) files can be created'}), 403
                
                # Ensure parent directory exists
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                
                # If no content provided and it's a markdown file, use template
                if not content and name.endswith('.md'):
                    title = os.path.splitext(name)[0].replace('-', ' ').title()
                    content = f"""# {title}

{title} description goes here.

---

## Content

Add your content here.
"""
                
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                action_type = 'create_file'
            
            # Log the action
            log_action(action_type, 'filesystem', 
                      data={'path': os.path.join(path, name), 'is_directory': is_directory}, 
                      user=get_current_user_email())
            
            return jsonify({
                'status': 'success',
                'path': os.path.join(path, name).replace('\\', '/'),
                'is_directory': is_directory
            })
            
        except Exception as e:
            return jsonify({'error': f'Failed to create: {str(e)}'}), 500
        
    except Exception as e:
        return jsonify({'error': f'Failed to create file/directory: {str(e)}'}), 500

@app.route('/api/filesystem/delete', methods=['DELETE'])
@admin_required
def delete_file_or_directory():
    """Delete a file or directory"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        file_path = data.get('path', '')
        
        if not file_path:
            return jsonify({'error': 'File path required'}), 400
        
        # Sanitize path
        if '..' in file_path or file_path.startswith('/') or '\\' in file_path:
            return jsonify({'error': 'Invalid file path'}), 400
        
        full_path = os.path.join(CONTENT_ROOT, file_path)
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'File or directory not found'}), 404
        
        # Check deletion permissions
        is_inside_vitepress = file_path.startswith('.vitepress/') or file_path.startswith('.vitepress\\')
        
        if is_inside_vitepress:
            # Inside .vitepress folder - prevent deletion of all files and directories
            return jsonify({'error': 'Files and directories inside .vitepress folder cannot be deleted'}), 403
        
        if os.path.isfile(full_path):
            # Outside .vitepress folder - only allow .md files and specific VitePress config files
            filename = os.path.basename(file_path).lower()
            is_allowed = (file_path.lower().endswith('.md') or 
                         filename in ['config.js', 'config.ts', 'config.mjs', 'config.json', 'package.json'] or
                         filename.endswith('.vue'))
            if not is_allowed:
                return jsonify({'error': 'Only markdown and VitePress configuration files can be deleted'}), 403
        
        # Prevent deletion of important files/directories
        protected_paths = ['policies', 'index.md', '.vitepress', 'recently_deleted']
        if any(file_path.startswith(protected) for protected in protected_paths):
            return jsonify({'error': 'Cannot delete protected files/directories'}), 403
        
        try:
            # Create recently_deleted folder if it doesn't exist
            recently_deleted_path = os.path.join(CONTENT_ROOT, 'recently_deleted')
            os.makedirs(recently_deleted_path, exist_ok=True)
            
            # Generate unique name to avoid conflicts in recently_deleted folder
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            original_name = os.path.basename(file_path)
            new_name = f"{timestamp}_{original_name}"
            destination_path = os.path.join(recently_deleted_path, new_name)
            
            # Move file/directory to recently_deleted folder instead of deleting
            shutil.move(full_path, destination_path)
            
            if os.path.isdir(destination_path):
                action_type = 'move_directory_to_deleted'
            else:
                action_type = 'move_file_to_deleted'
            
            # Log the action
            log_action(action_type, 'filesystem', data={'path': file_path}, 
                      user=get_current_user_email())
            
            return jsonify({'status': 'success', 'path': file_path})
            
        except Exception as e:
            return jsonify({'error': f'Failed to delete: {str(e)}'}), 500
        
    except Exception as e:
        return jsonify({'error': f'Failed to delete file/directory: {str(e)}'}), 500

@app.route('/api/filesystem/rename', methods=['POST'])
@admin_required
def rename_file_or_directory():
    """Rename a file or directory"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        old_path = data.get('old_path', '')
        new_name = data.get('new_name', '')
        
        if not old_path or not new_name:
            return jsonify({'error': 'Old path and new name required'}), 400
        
        # Sanitize inputs
        if '..' in old_path or old_path.startswith('/') or '\\' in old_path:
            return jsonify({'error': 'Invalid old path'}), 400
        
        if '..' in new_name or '/' in new_name or '\\' in new_name:
            return jsonify({'error': 'Invalid new name'}), 400
        
        old_full_path = os.path.join(CONTENT_ROOT, old_path)
        new_full_path = os.path.join(os.path.dirname(old_full_path), new_name)
        
        if not os.path.exists(old_full_path):
            return jsonify({'error': 'File or directory not found'}), 404
        
        if os.path.exists(new_full_path):
            return jsonify({'error': 'Target name already exists'}), 400
        
        # Check file renaming permissions
        is_inside_vitepress = old_path.startswith('.vitepress/') or old_path.startswith('.vitepress\\')
        is_inside_recently_deleted = old_path.startswith('recently_deleted/') or old_path.startswith('recently_deleted\\')
        
        if is_inside_vitepress:
            # Inside .vitepress folder - prevent renaming of all files and directories
            return jsonify({'error': 'Files and directories inside .vitepress folder cannot be renamed'}), 403
        elif is_inside_recently_deleted:
            # Inside recently_deleted folder - prevent renaming of all files and directories
            return jsonify({'error': 'Files and directories inside recently_deleted folder cannot be renamed'}), 403
        
        if os.path.isfile(old_full_path):
            # Outside .vitepress folder - only allow .md files and specific VitePress config files
            filename = os.path.basename(old_path).lower()
            is_allowed = (old_path.lower().endswith('.md') or 
                         filename in ['config.js', 'config.ts', 'config.mjs', 'config.json', 'package.json'] or
                         filename.endswith('.vue'))
            if not is_allowed:
                return jsonify({'error': 'Only markdown and VitePress configuration files can be renamed'}), 403
        
        # Ensure new name maintains .md extension for markdown files only (outside .vitepress)
        is_inside_vitepress = old_path.startswith('.vitepress/') or old_path.startswith('.vitepress\\')
        if (os.path.isfile(old_full_path) and not is_inside_vitepress and 
            old_path.lower().endswith('.md') and not new_name.lower().endswith('.md')):
            new_name += '.md'
            new_full_path = os.path.join(os.path.dirname(old_full_path), new_name)
        
        # Prevent renaming of important files/directories
        protected_paths = ['policies', 'index.md', '.vitepress', 'recently_deleted']
        if any(old_path.startswith(protected) for protected in protected_paths):
            return jsonify({'error': 'Cannot rename protected files/directories'}), 403
        
        try:
            os.rename(old_full_path, new_full_path)
            
            new_path = os.path.join(os.path.dirname(old_path), new_name).replace('\\', '/')
            
            # Log the action
            log_action('rename', 'filesystem', 
                      data={'old_path': old_path, 'new_path': new_path}, 
                      user=get_current_user_email())
            
            return jsonify({
                'status': 'success',
                'old_path': old_path,
                'new_path': new_path
            })
            
        except Exception as e:
            return jsonify({'error': f'Failed to rename: {str(e)}'}), 500
        
    except Exception as e:
        return jsonify({'error': f'Failed to rename file/directory: {str(e)}'}), 500


# Manual endpoint to trigger VitePress rebuild
@app.route('/api/rebuild-docs', methods=['POST'])
@admin_required
def api_rebuild_docs():
    # Allow CORS for this endpoint
    from flask import make_response, request
    success, output = rebuild_vitepress_docs()
    response = make_response(jsonify({'vitepress_rebuild': success, 'vitepress_output': output}))
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
