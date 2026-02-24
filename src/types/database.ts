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
          store: string | null
          role: 'employee' | 'manager' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          name: string
          email: string
          hire_date?: string | null
          store?: string | null
          role?: 'employee' | 'manager' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          name?: string
          email?: string
          hire_date?: string | null
          store?: string | null
          role?: 'employee' | 'manager' | 'admin'
          created_at?: string
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
          status: 'pending' | 'certified'
          achieved_at: string
          certified_by: string | null
          certified_at: string | null
          cumulative_hours_at_achievement: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          skill_id: string
          status?: 'pending' | 'certified'
          achieved_at?: string
          certified_by?: string | null
          certified_at?: string | null
          cumulative_hours_at_achievement?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          skill_id?: string
          status?: 'pending' | 'certified'
          achieved_at?: string
          certified_by?: string | null
          certified_at?: string | null
          cumulative_hours_at_achievement?: number | null
          notes?: string | null
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

// 便利な型エイリアス
export type Employee = Database['public']['Tables']['employees']['Row']
export type Skill = Database['public']['Tables']['skills']['Row']
export type Achievement = Database['public']['Tables']['achievements']['Row']
export type WorkHour = Database['public']['Tables']['work_hours']['Row']

export type Phase = '4月' | '5月〜6月' | '7月〜8月'
export type Category = '接客' | '調理' | '管理' | 'その他'
export type Role = 'employee' | 'manager' | 'admin'
export type AchievementStatus = 'pending' | 'certified'
