export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          auth_user_id: string | null
          name: string
          email: string
          hire_date: string | null
          role: 'employee' | 'manager' | 'admin' | 'ops_manager'
          employment_type: '社員' | 'メイト'
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          name: string
          email: string
          hire_date?: string | null
          role?: 'employee' | 'manager' | 'admin' | 'ops_manager'
          employment_type?: '社員' | 'メイト'
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          name?: string
          email?: string
          hire_date?: string | null
          role?: 'employee' | 'manager' | 'admin' | 'ops_manager'
          employment_type?: '社員' | 'メイト'
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          name: string
          type: 'store' | 'project'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'store' | 'project'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'store' | 'project'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          team_id: string
          employee_id: string
        }
        Insert: {
          team_id: string
          employee_id: string
        }
        Update: {
          team_id?: string
          employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_members_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      team_managers: {
        Row: {
          team_id: string
          employee_id: string
        }
        Insert: {
          team_id: string
          employee_id: string
        }
        Update: {
          team_id?: string
          employee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_managers_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_managers_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      team_change_requests: {
        Row: {
          id: string
          requested_by: string
          request_type: 'create_team' | 'add_member' | 'remove_member' | 'add_manager' | 'remove_manager'
          team_id: string | null
          payload: Json
          status: 'pending' | 'approved' | 'rejected'
          reviewed_by: string | null
          reviewed_at: string | null
          review_comment: string | null
          applicant_read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          requested_by: string
          request_type: 'create_team' | 'add_member' | 'remove_member' | 'add_manager' | 'remove_manager'
          team_id?: string | null
          payload: Json
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          applicant_read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          requested_by?: string
          request_type?: 'create_team' | 'add_member' | 'remove_member' | 'add_manager' | 'remove_manager'
          team_id?: string | null
          payload?: Json
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_comment?: string | null
          applicant_read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'team_change_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_change_requests_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'team_change_requests_team_id_fkey'
            columns: ['team_id']
            isOneToOne: false
            referencedRelation: 'teams'
            referencedColumns: ['id']
          },
        ]
      }
      phase_milestones: {
        Row: {
          phase: '4月' | '5月〜6月' | '7月〜8月'
          employment_type: '社員' | 'メイト'
          end_hours: number
          updated_at: string
        }
        Insert: {
          phase: '4月' | '5月〜6月' | '7月〜8月'
          employment_type: '社員' | 'メイト'
          end_hours: number
          updated_at?: string
        }
        Update: {
          phase?: '4月' | '5月〜6月' | '7月〜8月'
          employment_type?: '社員' | 'メイト'
          end_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          id: string
          name: string
          phase: '4月' | '5月〜6月' | '7月〜8月'
          category: '接客' | '調理' | '管理' | 'その他'
          order_index: number
          target_date_hint: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          phase: '4月' | '5月〜6月' | '7月〜8月'
          category: '接客' | '調理' | '管理' | 'その他'
          order_index?: number
          target_date_hint?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          phase?: '4月' | '5月〜6月' | '7月〜8月'
          category?: '接客' | '調理' | '管理' | 'その他'
          order_index?: number
          target_date_hint?: string | null
          created_at?: string
        }
        Relationships: []
      }
      achievements: {
        Row: {
          id: string
          employee_id: string
          skill_id: string
          status: 'pending' | 'certified' | 'rejected'
          achieved_at: string
          certified_by: string | null
          certified_at: string | null
          cumulative_hours_at_achievement: number | null
          notes: string | null
          apply_comment: string | null
          certify_comment: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          skill_id: string
          status?: 'pending' | 'certified' | 'rejected'
          achieved_at?: string
          certified_by?: string | null
          certified_at?: string | null
          cumulative_hours_at_achievement?: number | null
          notes?: string | null
          apply_comment?: string | null
          certify_comment?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          skill_id?: string
          status?: 'pending' | 'certified' | 'rejected'
          achieved_at?: string
          certified_by?: string | null
          certified_at?: string | null
          cumulative_hours_at_achievement?: number | null
          notes?: string | null
          apply_comment?: string | null
          certify_comment?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'achievements_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'achievements_skill_id_fkey'
            columns: ['skill_id']
            isOneToOne: false
            referencedRelation: 'skills'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'achievements_certified_by_fkey'
            columns: ['certified_by']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      work_hours: {
        Row: {
          id: string
          employee_id: string
          work_date: string
          hours: number
          imported_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          work_date: string
          hours: number
          imported_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          work_date?: string
          hours?: number
          imported_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'work_hours_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_employee_cumulative_hours: {
        Args: { p_employee_id: string; p_as_of_date: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Skill = Database['public']['Tables']['skills']['Row']
export type Achievement = Database['public']['Tables']['achievements']['Row']
export type WorkHour = Database['public']['Tables']['work_hours']['Row']
export type Team = Database['public']['Tables']['teams']['Row']
export type TeamMember = Database['public']['Tables']['team_members']['Row']
export type TeamChangeRequest = Database['public']['Tables']['team_change_requests']['Row']

export type Phase = '4月' | '5月〜6月' | '7月〜8月'
export type Category = '接客' | '調理' | '管理' | 'その他'
export type Role = 'employee' | 'manager' | 'admin' | 'ops_manager'
export type AchievementStatus = 'pending' | 'certified' | 'rejected'
export type EmploymentType = '社員' | 'メイト'
export type TeamType = 'store' | 'project'

export type Employee = Database['public']['Tables']['employees']['Row']

// 標準進捗マイルストーン
export type PhaseMilestone = {
  phase: Phase
  employment_type: EmploymentType
  end_hours: number
  updated_at: string
}

// ダッシュボードで使うマイルストーンマップ（start/end を計算済み）
export type MilestoneMap = Record<Phase, { start: number; end: number }>
