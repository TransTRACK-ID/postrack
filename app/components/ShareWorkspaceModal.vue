<script setup lang="ts">
import Modal from './Modal.vue';
import { usePermissionBadge } from '../composables/usePermissionBadge';

const { getPermissionBadge } = usePermissionBadge();

interface ShareInfo {
  id: string;
  shareToken: string;
  shareUrl: string;
  permission: 'view' | 'edit';
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  accessCount: number;
  isExpired: boolean;
  folderId?: string | null;
  folderName?: string | null;
}

interface MemberInfo {
  id: string;
  email: string;
  userId: string | null;
  permission: 'view' | 'edit' | 'owner';
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  isCurrentUser: boolean;
  isOriginalOwner: boolean;
}

interface Props {
  show: boolean;
  workspaceId: string;
  workspaceName: string;
  folderId?: string;
  folderName?: string;
  folderIsSharedBase?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  workspaceId: '',
  workspaceName: '',
  folderId: '',
  folderName: '',
  folderIsSharedBase: false
});

const emit = defineEmits<{
  close: [];
  shared: [];
}>();

const activeTab = ref<'shares' | 'members'>('shares');

// Share link state
const shares = ref<ShareInfo[]>([]);
const isLoadingShares = ref(false);
const isCreatingShare = ref(false);
const copiedToken = ref<string | null>(null);

const newShareForm = ref({
  permission: 'view' as 'view' | 'edit',
  expiresInDays: 0
});

const expirationOptions = [
  { value: 0, label: 'Never' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' }
];

// Member state
const members = ref<MemberInfo[]>([]);
const isLoadingMembers = ref(false);
const isInvitingMember = ref(false);
const isOwner = ref(false);

const newMemberForm = ref({
  email: '',
  permission: 'view' as 'view' | 'edit' | 'owner'
});

// Error and success messages
const error = ref('');
const successMessage = ref('');

const fetchShares = async () => {
  if (!props.workspaceId) return;
  
  isLoadingShares.value = true;
  error.value = '';
  
  try {
    const response = await $fetch<ShareInfo[]>(`/api/admin/workspaces/${props.workspaceId}/shares`);
    shares.value = response;
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to fetch shares';
    console.error('Error fetching shares:', e);
  } finally {
    isLoadingShares.value = false;
  }
};

const fetchMembers = async () => {
  if (!props.workspaceId) return;
  
  isLoadingMembers.value = true;
  error.value = '';
  
  try {
    const response = await $fetch<{ members: MemberInfo[]; isOwner: boolean }>(`/api/admin/workspaces/${props.workspaceId}/members`);
    members.value = response.members;
    isOwner.value = response.isOwner;
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to fetch members';
    console.error('Error fetching members:', e);
  } finally {
    isLoadingMembers.value = false;
  }
};

const createShare = async () => {
  if (!props.workspaceId) return;
  
  isCreatingShare.value = true;
  error.value = '';
  successMessage.value = '';
  
    try {
    const body: any = {
      permission: newShareForm.value.permission
    };
    
    if (newShareForm.value.expiresInDays > 0) {
      body.expiresInDays = newShareForm.value.expiresInDays;
    }
    
    if (props.folderId) {
      body.folderId = props.folderId;
    }
    
    await $fetch(`/api/admin/workspaces/${props.workspaceId}/shares`, {
      method: 'POST',
      body
    });
    
    successMessage.value = 'Share link created successfully!';
    await fetchShares();
    emit('shared');
    
    newShareForm.value = {
      permission: 'view',
      expiresInDays: 0
    };
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to create share link';
    console.error('Error creating share:', e);
  } finally {
    isCreatingShare.value = false;
  }
};

const inviteMember = async () => {
  if (!props.workspaceId) return;
  
  isInvitingMember.value = true;
  error.value = '';
  successMessage.value = '';
  
  try {
    await $fetch(`/api/admin/workspaces/${props.workspaceId}/members`, {
      method: 'POST',
      body: {
        email: newMemberForm.value.email,
        permission: newMemberForm.value.permission
      }
    });
    
    successMessage.value = 'Invitation sent successfully!';
    await fetchMembers();
    emit('shared');
    
    newMemberForm.value = {
      email: '',
      permission: 'view'
    };
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to send invitation';
    console.error('Error inviting member:', e);
  } finally {
    isInvitingMember.value = false;
  }
};

const revokeShare = async (token: string) => {
  if (!confirm('Are you sure you want to revoke this share link? All users who accessed via this link will lose access immediately.')) {
    return;
  }
  
  error.value = '';
  
  try {
    await $fetch(`/api/admin/shares/${token}`, {
      method: 'DELETE'
    });
    
    successMessage.value = 'Share link revoked successfully!';
    await fetchShares();
    emit('shared');
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to revoke share link';
    console.error('Error revoking share:', e);
  }
};

const removeMember = async (memberId: string) => {
  if (!confirm('Are you sure you want to remove this member? They will lose access to this workspace immediately.')) {
    return;
  }
  
  error.value = '';
  
  try {
    await $fetch(`/api/admin/workspaces/${props.workspaceId}/members/${memberId}`, {
      method: 'DELETE'
    });
    
    successMessage.value = 'Member removed successfully!';
    await fetchMembers();
    emit('shared');
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to remove member';
    console.error('Error removing member:', e);
  }
};

const updateMemberPermission = async (memberId: string, newPermission: 'view' | 'edit' | 'owner') => {
  error.value = '';
  
  try {
    await $fetch(`/api/admin/workspaces/${props.workspaceId}/members/${memberId}`, {
      method: 'PUT',
      body: {
        permission: newPermission
      }
    });
    
    successMessage.value = 'Permission updated successfully!';
    await fetchMembers();
    emit('shared');
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to update permission';
    console.error('Error updating member permission:', e);
  }
};

const copyShareUrl = async (shareUrl: string, token: string) => {
  try {
    await navigator.clipboard.writeText(shareUrl);
    copiedToken.value = token;
    setTimeout(() => {
      copiedToken.value = null;
    }, 2000);
  } catch (e) {
    console.error('Failed to copy URL:', e);
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'accepted':
      return 'bg-accent-green/15 text-accent-green';
    case 'pending':
      return 'bg-accent-yellow/15 text-accent-yellow';
    case 'revoked':
      return 'bg-accent-red/15 text-accent-red';
    default:
      return 'bg-bg-tertiary text-text-muted';
  }
};

const handleClose = () => {
  error.value = '';
  successMessage.value = '';
  activeTab.value = 'shares';
  emit('close');
};

watch(() => props.show, (newVal) => {
  if (newVal && props.workspaceId) {
    fetchShares();
    fetchMembers();
  }
});

watch(() => props.workspaceId, (newVal) => {
  if (props.show && newVal) {
    fetchShares();
    fetchMembers();
  }
});
</script>

<template>
  <Modal :show="show" :title="folderName ? 'Share Folder' : 'Share Workspace'" size="lg" @close="handleClose">
    <div class="space-y-6">
      <!-- Workspace Info -->
      <div class="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg">
        <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-accent-blue/15 text-accent-blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold text-text-primary m-0">
            {{ workspaceName }}
            <span v-if="folderName" class="text-accent-blue"> → {{ folderName }}</span>
          </p>
          <p class="text-xs text-text-muted m-0">
            <span v-if="folderName">Share this folder with other registered users</span>
            <span v-else>Share this workspace with other registered users</span>
          </p>
          <p
            v-if="folderName && folderIsSharedBase"
            class="text-[11px] text-accent-green mt-1.5 mb-0"
          >
            This folder is the customer documentation base.
          </p>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="p-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
        <p class="text-sm text-accent-red m-0">{{ error }}</p>
      </div>

      <!-- Success Message -->
      <div v-if="successMessage" class="p-3 bg-accent-green/10 border border-accent-green/30 rounded-lg">
        <p class="text-sm text-accent-green m-0">{{ successMessage }}</p>
      </div>

      <!-- Tabs -->
      <div class="border-b border-border-default">
        <div class="flex gap-1">
          <button
            @click="activeTab = 'shares'"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2',
              activeTab === 'shares'
                ? 'text-accent-blue border-accent-blue'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            ]"
          >
            Share Links
          </button>
          <button
            @click="activeTab = 'members'"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2',
              activeTab === 'members'
                ? 'text-accent-blue border-accent-blue'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            ]"
          >
            Members
          </button>
        </div>
      </div>

      <!-- Share Links Tab -->
      <div v-if="activeTab === 'shares'" class="space-y-6">
        <!-- Create New Share -->
        <div class="p-4 bg-bg-secondary border border-border-default rounded-lg">
          <h3 class="text-sm font-semibold text-text-primary mb-4 m-0">Create New Share Link</h3>
          
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Permission</label>
              <select 
                v-model="newShareForm.permission"
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              >
                <option value="view">Viewer (Read Only)</option>
                <option value="edit">Editor (Can Edit)</option>
              </select>
            </div>
            
            <div>
              <label class="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">Expires In</label>
              <select 
                v-model="newShareForm.expiresInDays"
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              >
                <option v-for="opt in expirationOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3 text-xs text-text-muted mb-4">
            <div class="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span v-if="newShareForm.permission === 'view'">Viewers can see all requests but cannot edit</span>
              <span v-else>Editors can view and edit requests, but cannot delete or share</span>
            </div>
          </div>

          <button 
            class="btn btn-primary w-full"
            @click="createShare"
            :disabled="isCreatingShare"
          >
            <svg v-if="!isCreatingShare" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span v-if="isCreatingShare">Creating...</span>
            <span v-else>Generate Share Link</span>
          </button>
        </div>

        <!-- Active Shares -->
        <div>
          <h3 class="text-sm font-semibold text-text-primary mb-3 m-0">Active Share Links</h3>
          
          <div v-if="isLoadingShares" class="flex items-center justify-center py-8 text-text-muted text-sm">
            Loading shares...
          </div>
          
          <div v-else-if="shares.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted opacity-30 mb-3">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <p class="text-sm text-text-muted m-0">No active share links</p>
            <p class="text-xs text-text-muted m-0">Create a share link above to share this workspace</p>
          </div>
          
          <div v-else class="space-y-2">
            <div 
              v-for="share in shares" 
              :key="share.id"
              :class="[
                'p-3 border rounded-lg',
                share.isActive && !share.isExpired 
                  ? 'bg-bg-secondary border-border-default' 
                  : 'bg-bg-tertiary/50 border-border-default/50 opacity-60'
              ]"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <span :class="[
                      'px-2 py-0.5 rounded text-[10px] font-semibold uppercase',
                      share.permission === 'edit'
                        ? 'bg-accent-orange/15 text-accent-orange'
                        : 'bg-accent-blue/15 text-accent-blue'
                    ]">
                      {{ share.permission === 'edit' ? 'Editor' : 'Viewer' }}
                    </span>

                    <span v-if="share.folderName" class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-purple/15 text-accent-purple">
                      Folder: {{ share.folderName }}
                    </span>

                    <span v-if="!share.isActive" class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-red/15 text-accent-red">
                      Revoked
                    </span>

                    <span v-else-if="share.isExpired" class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-yellow/15 text-accent-yellow">
                      Expired
                    </span>

                    <span v-else class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-green/15 text-accent-green">
                      Active
                    </span>
                  </div>
                  
                  <div class="flex items-center gap-2 mb-2">
                    <input 
                      type="text" 
                      :value="share.shareUrl"
                      readonly
                      class="flex-1 py-1.5 px-2 bg-bg-input border border-border-default rounded text-xs font-mono text-text-secondary truncate"
                    />
                    <button 
                      v-if="share.isActive && !share.isExpired"
                      @click="copyShareUrl(share.shareUrl, share.shareToken)"
                      :class="[
                        'p-1.5 rounded transition-colors',
                        copiedToken === share.shareToken 
                          ? 'bg-accent-green/15 text-accent-green' 
                          : 'bg-bg-hover text-text-secondary hover:bg-bg-tertiary'
                      ]"
                      :title="copiedToken === share.shareToken ? 'Copied!' : 'Copy link'"
                    >
                      <svg v-if="copiedToken === share.shareToken" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <div class="flex items-center gap-4 text-[10px] text-text-muted">
                    <span>Created {{ formatDate(share.createdAt) }}</span>
                    <span v-if="share.expiresAt">Expires {{ formatDate(share.expiresAt) }}</span>
                    <span v-else>Never expires</span>
                    <span>{{ share.accessCount }} {{ share.accessCount === 1 ? 'user' : 'users' }} accessed</span>
                  </div>
                </div>
                
                <button 
                  v-if="share.isActive && !share.isExpired"
                  @click="revokeShare(share.shareToken)"
                  class="p-1.5 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                  title="Revoke share link"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Members Tab -->
      <div v-if="activeTab === 'members'" class="space-y-6">
        <!-- Invite Member (Owner Only) -->
        <div v-if="isOwner" class="p-4 bg-bg-secondary border border-border-default rounded-lg">
          <h3 class="text-sm font-semibold text-text-primary mb-4 m-0">Invite New Member</h3>
          
          <div class="flex gap-3 mb-4">
            <div class="flex-1">
              <input
                v-model="newMemberForm.email"
                type="email"
                placeholder="Enter email address"
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
                @keyup.enter="inviteMember"
              />
            </div>
            <div class="w-40">
              <select 
                v-model="newMemberForm.permission"
                class="w-full py-2.5 px-3 bg-bg-input border border-border-default rounded-md text-text-primary text-sm focus:outline-none focus:border-accent-blue"
              >
                <option value="view">Viewer</option>
                <option value="edit">Editor</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3 text-xs text-text-muted mb-4">
            <div class="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span v-if="newMemberForm.permission === 'view'">Viewers can see all requests but cannot edit</span>
              <span v-else-if="newMemberForm.permission === 'edit'">Editors can view and edit requests, but cannot manage members</span>
              <span v-else>Owners can manage members, share links, and workspace settings</span>
            </div>
          </div>

          <button 
            class="btn btn-primary w-full"
            @click="inviteMember"
            :disabled="isInvitingMember || !newMemberForm.email"
          >
            <svg v-if="!isInvitingMember" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span v-if="isInvitingMember">Sending...</span>
            <span v-else>Send Invitation</span>
          </button>
        </div>

        <div v-else class="p-4 bg-bg-secondary/50 border border-border-default/50 rounded-lg">
          <p class="text-sm text-text-muted m-0 text-center">Only the workspace owner can invite new members.</p>
        </div>

        <!-- Members List -->
        <div>
          <h3 class="text-sm font-semibold text-text-primary mb-3 m-0">Workspace Members</h3>
          
          <div v-if="isLoadingMembers" class="flex items-center justify-center py-8 text-text-muted text-sm">
            Loading members...
          </div>
          
          <div v-else-if="members.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted opacity-30 mb-3">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <p class="text-sm text-text-muted m-0">No members yet</p>
            <p v-if="isOwner" class="text-xs text-text-muted m-0">Invite members to give them direct access to this workspace</p>
          </div>
          
          <div v-else class="space-y-2">
            <div 
              v-for="member in members" 
              :key="member.id"
              class="p-3 bg-bg-secondary border border-border-default rounded-lg"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm font-medium text-text-primary">{{ member.email }}</span>
                    
                    <span v-if="member.isCurrentUser" class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-accent-blue/15 text-accent-blue">
                      You
                    </span>
                    
                    <span :class="[
                      'px-2 py-0.5 rounded text-[10px] font-semibold uppercase',
                      getStatusBadgeClass(member.status)
                    ]">
                      {{ member.status }}
                    </span>
                    
                    <span :class="[
                      'px-2 py-0.5 rounded text-[10px] font-semibold uppercase',
                      getPermissionBadge(member.permission).className
                    ]">
                      {{ getPermissionBadge(member.permission).text }}
                    </span>
                  </div>
                  
                  <div class="flex items-center gap-4 text-[10px] text-text-muted">
                    <span>Invited {{ formatDate(member.invitedAt) }}</span>
                    <span v-if="member.acceptedAt">Accepted {{ formatDate(member.acceptedAt) }}</span>
                  </div>
                </div>
                
                <!-- Owner Actions -->
                <div v-if="isOwner && !member.isCurrentUser && member.status !== 'revoked' && !member.isOriginalOwner" class="flex items-center gap-1">
                  <!-- Permission Dropdown -->
                  <select
                    v-if="member.status === 'accepted'"
                    :value="member.permission"
                    @change="updateMemberPermission(member.id, ($event.target as HTMLSelectElement).value as 'view' | 'edit' | 'owner')"
                    class="py-1 px-2 bg-bg-input border border-border-default rounded text-xs text-text-primary focus:outline-none focus:border-accent-blue"
                  >
                    <option value="view">Viewer</option>
                    <option value="edit">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  
                  <!-- Remove Button -->
                  <button 
                    @click="removeMember(member.id)"
                    class="p-1.5 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
                    :title="member.status === 'pending' ? 'Cancel invitation' : 'Remove member'"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-secondary" @click="handleClose">Close</button>
    </template>
  </Modal>
</template>
