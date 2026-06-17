// State management
let state = {
    notes: [],
    filteredNotes: [],
    selectedNote: null,
    searchQuery: '',
    selectedType: 'all',
    lastUpdated: null
};

// DOM Elements
const notesList = document.getElementById('notes-list');
const listLoading = document.getElementById('list-loading');
const listError = document.getElementById('list-error');
const listEmpty = document.getElementById('list-empty');

const searchInput = document.getElementById('search-input');
const typeFiltersContainer = document.getElementById('type-filters');

const btnRefresh = document.getElementById('btn-refresh');
const refreshSpinner = document.getElementById('refresh-spinner');
const feedUpdatedTime = document.getElementById('feed-updated-time');

const detailEmptyState = document.getElementById('detail-empty-state');
const detailViewer = document.getElementById('detail-viewer');
const detailDate = document.getElementById('detail-date');
const detailType = document.getElementById('detail-type');
const detailDocLink = document.getElementById('detail-doc-link');
const detailContent = document.getElementById('detail-content');

const tweetTextarea = document.getElementById('tweet-textarea');
const charProgressCircle = document.getElementById('char-progress-circle');
const charCountText = document.getElementById('char-count-text');
const btnShareTweet = document.getElementById('btn-share-tweet');

// Circular progress constants
const CIRCLE_RADIUS = 12;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~75.4

// Initialize circle stroke properties
charProgressCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
charProgressCircle.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Add retry handlers
    document.getElementById('btn-retry-list').addEventListener('click', fetchReleaseNotes);
    
    // Add refresh handlers
    btnRefresh.addEventListener('click', () => {
        fetchReleaseNotes();
    });

    // Add filter search handlers
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase();
        applyFilters();
    });

    // Add category filter handlers
    typeFiltersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-badge')) {
            // Update active styling
            document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Set type
            state.selectedType = e.target.dataset.type;
            applyFilters();
        }
    });

    // Sidebar stat card quick filters
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.filter;
            // Activate filter badge matching the stat card
            const badge = document.querySelector(`.filter-badge[data-type="${filterType}"]`);
            if (badge) {
                badge.click();
            } else if (filterType === 'all') {
                document.querySelector('.filter-badge[data-type="all"]').click();
            }
        });
    });

    // Tweet text area listener
    tweetTextarea.addEventListener('input', handleTweetTextChange);

    // Share Tweet action
    btnShareTweet.addEventListener('click', shareOnTwitter);

    // Load notes initially
    fetchReleaseNotes();
});

// Fetch release notes from backend Flask API
async function fetchReleaseNotes() {
    // Reset view states
    showLoading();
    
    // Start spinner
    refreshSpinner.classList.add('spinning');
    btnRefresh.disabled = true;

    try {
        const response = await fetch('/api/release-notes');
        const result = await response.json();

        if (result.status === 'success') {
            state.notes = result.data;
            state.filteredNotes = [...result.data];
            state.lastUpdated = new Date();
            
            // Update timestamps and counters
            updateTimestamps();
            updateStats();
            
            // Render list
            renderNotesList();
            
            // Hide loading states
            hideLoading();
            
            // Select first note by default if available and none selected
            if (state.notes.length > 0 && !state.selectedNote) {
                selectNote(state.notes[0].id);
            }
        } else {
            throw new Error(result.message || 'Unknown backend error');
        }
    } catch (err) {
        console.error('Error fetching release notes:', err);
        showError();
    } finally {
        // Stop spinner
        setTimeout(() => {
            refreshSpinner.classList.remove('spinning');
            btnRefresh.disabled = false;
        }, 600); // smooth cooldown
    }
}

// Update last updated text
function updateTimestamps() {
    if (state.lastUpdated) {
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
        feedUpdatedTime.innerText = `Last updated: ${state.lastUpdated.toLocaleTimeString(undefined, options)}`;
    } else {
        feedUpdatedTime.innerText = 'Last updated: Never';
    }
}

// Compute statistics counters
function updateStats() {
    const counts = {
        all: state.notes.length,
        Feature: 0,
        Issue: 0,
        Breaking: 0
    };

    state.notes.forEach(note => {
        if (note.type === 'Feature') counts.Feature++;
        else if (note.type === 'Issue') counts.Issue++;
        else if (note.type === 'Breaking') counts.Breaking++;
    });

    document.getElementById('stat-all').innerText = counts.all;
    document.getElementById('stat-feature').innerText = counts.Feature;
    document.getElementById('stat-issue').innerText = counts.Issue;
    document.getElementById('stat-breaking').innerText = counts.Breaking;
}

// Filter release notes by type and search query
function applyFilters() {
    state.filteredNotes = state.notes.filter(note => {
        // Category type filter
        const matchesType = state.selectedType === 'all' || note.type === state.selectedType;
        
        // Search query filter (matches type, date, or content)
        const contentText = note.content_html.toLowerCase();
        const matchesSearch = !state.searchQuery || 
                              note.type.toLowerCase().includes(state.searchQuery) ||
                              note.date.toLowerCase().includes(state.searchQuery) ||
                              contentText.includes(state.searchQuery);
        
        return matchesType && matchesSearch;
    });

    // Sync active sidebar card
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    const activeStatCard = document.querySelector(`.stat-card[data-filter="${state.selectedType}"]`);
    if (activeStatCard) {
        activeStatCard.classList.add('active');
    }

    renderNotesList();
}

// Render release notes items in the sidebar
function renderNotesList() {
    notesList.innerHTML = '';

    if (state.filteredNotes.length === 0) {
        listEmpty.classList.remove('hidden');
        return;
    }

    listEmpty.classList.add('hidden');

    state.filteredNotes.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.className = `note-item ${state.selectedNote && state.selectedNote.id === note.id ? 'active' : ''}`;
        noteItem.dataset.id = note.id;
        
        // Assign type colors via CSS variables
        const typeColor = getTypeColor(note.type);
        const typeRgb = getTypeRgb(note.type);
        noteItem.style.setProperty('--type-color', typeColor);
        noteItem.style.setProperty('--type-rgb', typeRgb);

        // Extract a clean snippet of text for preview
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = note.content_html;
        // remove the type header (h3) if present
        const h3 = tempDiv.querySelector('h3');
        if (h3) h3.remove();
        const snippetText = tempDiv.textContent.trim();

        noteItem.innerHTML = `
            <div class="note-item-header">
                <span class="note-item-date">${note.date}</span>
                <span class="note-item-type">${note.type}</span>
            </div>
            <p class="note-item-snippet">${snippetText}</p>
        `;

        noteItem.addEventListener('click', () => {
            selectNote(note.id);
        });

        notesList.appendChild(noteItem);
    });
}

// Select a release note and render its details
function selectNote(noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;

    state.selectedNote = note;

    // Highlight item in list
    document.querySelectorAll('.note-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === noteId) {
            item.classList.add('active');
        }
    });

    // Configure detail view type colors
    const typeColor = getTypeColor(note.type);
    const typeRgb = getTypeRgb(note.type);
    detailViewer.style.setProperty('--type-color', typeColor);
    detailViewer.style.setProperty('--type-rgb', typeRgb);

    // Populate metadata
    detailDate.innerText = note.date;
    detailType.innerText = note.type;
    detailDocLink.href = note.link;

    // Render detailed HTML content
    detailContent.innerHTML = note.content_html;

    // Populate tweet composer
    let tweetTemplate = `BigQuery Update [${note.date}] - ${note.type}:\n`;
    
    // Extract a neat snippet from the note content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = note.content_html;
    const h3 = tempDiv.querySelector('h3');
    if (h3) h3.remove();
    let noteText = tempDiv.innerText.trim();
    
    // Clean whitespace
    noteText = noteText.replace(/\s+/g, ' ');
    
    // If the text is very long, truncate it
    const prefixLength = tweetTemplate.length;
    const suffix = `\n\nRead more: ${note.link}`;
    const allowedLength = 280 - prefixLength - suffix.length;
    
    if (noteText.length > allowedLength) {
        noteText = noteText.substring(0, allowedLength - 3) + '...';
    }
    
    tweetTemplate += `${noteText}${suffix}`;
    
    tweetTextarea.value = tweetTemplate;
    
    // Trigger progress update
    handleTweetTextChange();

    // Show details
    detailEmptyState.classList.add('hidden');
    detailViewer.classList.remove('hidden');

    // Make sure Lucide icons in the detail header are rendered
    lucide.createIcons();
}

// Manage tweet composer text changes
function handleTweetTextChange() {
    const text = tweetTextarea.value;
    const length = text.length;
    const remaining = 280 - length;
    
    // Update count text
    charCountText.innerText = remaining;
    
    // Styles based on characters remaining
    charCountText.className = '';
    if (remaining <= 20 && remaining > 0) {
        charCountText.classList.add('warning');
    } else if (remaining <= 0) {
        charCountText.classList.add('danger');
    }

    // Update circular indicator offset
    let percentage = length / 280;
    if (percentage > 1) percentage = 1;
    const offset = CIRCLE_CIRCUMFERENCE - (percentage * CIRCLE_CIRCUMFERENCE);
    charProgressCircle.style.strokeDashoffset = offset;

    // Circle colors based on state
    if (remaining <= 0) {
        charProgressCircle.style.stroke = '#ef4444'; // Red
    } else if (remaining <= 20) {
        charProgressCircle.style.stroke = '#f97316'; // Orange
    } else {
        charProgressCircle.style.stroke = '#1d9bf0'; // Twitter Blue
    }

    // Enable/disable submit button
    if (length > 0 && length <= 280) {
        btnShareTweet.classList.remove('disabled');
        btnShareTweet.disabled = false;
    } else {
        btnShareTweet.classList.add('disabled');
        btnShareTweet.disabled = true;
    }
}

// Post Tweet callback
function shareOnTwitter() {
    const tweetText = tweetTextarea.value;
    if (tweetText.length === 0 || tweetText.length > 280) return;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
}

// Helpers for accents
function getTypeColor(type) {
    switch (type) {
        case 'Feature': return 'var(--type-feature)';
        case 'Issue': return 'var(--type-issue)';
        case 'Breaking': return 'var(--type-breaking)';
        case 'Announcement': return 'var(--type-announcement)';
        case 'Change': return 'var(--type-change)';
        default: return 'var(--type-default)';
    }
}

// Return RGB values for box shadows
function getTypeRgb(type) {
    switch (type) {
        case 'Feature': return '139, 92, 246';
        case 'Issue': return '249, 115, 22';
        case 'Breaking': return '239, 68, 68';
        case 'Announcement': return '234, 179, 8';
        case 'Change': return '16, 185, 129';
        default: return '59, 130, 246';
    }
}

// UI States
function showLoading() {
    listLoading.classList.remove('hidden');
    notesList.classList.add('hidden');
    listError.classList.add('hidden');
    listEmpty.classList.add('hidden');
}

function hideLoading() {
    listLoading.classList.add('hidden');
    notesList.classList.remove('hidden');
}

function showError() {
    listLoading.classList.add('hidden');
    notesList.classList.add('hidden');
    listError.classList.remove('hidden');
}
