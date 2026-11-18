export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      calendar_item_history: {
        Row: { id: number; workspace_id: string; academic_year_id: string; item_key: string;
          before_value: Json | null; after_value: Json | null; actor_id: string; created_at: string; operation: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      academic_years: {
        Row: {
          id: string;
          school_id: string | null;
          version: number;
          workspace_id: string;
          year: number;
        };
        Insert: {
          id?: string;
          school_id?: string | null;
          version?: number;
          workspace_id: string;
          year: number;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          version?: number;
          workspace_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "academic_years_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      achievement_standards: {
        Row: {
          code: string;
          content: string;
          created_at: string;
          created_by: string | null;
          curriculum_version: string;
          grade_band: string;
          id: string;
          school_type: string;
          source: string;
          subject: string;
          workspace_id: string;
        };
        Insert: {
          code: string;
          content: string;
          created_at?: string;
          created_by?: string | null;
          curriculum_version: string;
          grade_band: string;
          id?: string;
          school_type: string;
          source?: string;
          subject: string;
          workspace_id: string;
        };
        Update: {
          code?: string;
          content?: string;
          created_at?: string;
          created_by?: string | null;
          curriculum_version?: string;
          grade_band?: string;
          id?: string;
          school_type?: string;
          source?: string;
          subject?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "achievement_standards_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          label: string;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          label: string;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          label?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_log_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      annual_academic_plans: {
        Row: {
          academic_year_id: string;
          document: Json;
          calendar_confirmation?: Json;
          history: Json;
          updated_at: string;
          updated_by?: string | null;
          version: number;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          document: Json;
          calendar_confirmation?: Json;
          history?: Json;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          document?: Json;
          calendar_confirmation?: Json;
          history?: Json;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "annual_academic_plans_workspace_id_academic_year_id_fkey";
            columns: ["workspace_id", "academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "annual_academic_plans_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          academic_year_id: string;
          class_number: number;
          grade: number;
          id: string;
          school_id: string | null;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          class_number: number;
          grade: number;
          id?: string;
          school_id?: string | null;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          class_number?: number;
          grade?: number;
          id?: string;
          school_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_workspace_id_fkey";
            columns: ["academic_year_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      curriculum_import_batches: {
        Row: {id:string;workspace_id:string;source_year:number;source_kind:string;
          source_rows:Json;imported_by:string;imported_at:string};
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_annual_excel_sheets: {
        Row: {
          workspace_id:string;
          academic_year:number;
          edits:Json;
          custom_rows:Json;
          version:number;
          updated_at:string;
          updated_by:string|null;
        };
        Insert:never;
        Update:never;
        Relationships:[];
      };
      curriculum_operating_sheets: {
        Row: {workspace_id:string;academic_year:number;document:Json;version:number;
          status:string;updated_at:string;updated_by:string|null;confirmed_at:string|null};
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_operating_history: {
        Row: {id:number;workspace_id:string;academic_year:number;version:number;document:Json;
          status:string;saved_at:string;saved_by:string|null};
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_design_documents: {
        Row: { plan_id:string;workspace_id:string;document:Json;version:number;updated_at:string;updated_by:string|null };
        Insert: never;Update:never;Relationships:[];
      };
      curriculum_design_locks: {
        Row: { plan_id:string;workspace_id:string;editor_id:string;expires_at:string;updated_at:string };
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_design_snapshots: {
        Row: { id:string;plan_id:string;workspace_id:string;version:number;document:Json;hours:Json;confirmed_at:string;confirmed_by:string };
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_design_revisions: {
        Row: { id:number;plan_id:string;workspace_id:string;version:number;document:Json;saved_at:string;saved_by:string };
        Insert:never;Update:never;Relationships:[];
      };
      curriculum_hours: {
        Row: {
          grade: number;
          hours: number;
          plan_id: string;
          school_id: string | null;
          semester: number;
          subject_id: string;
          workspace_id: string;
        };
        Insert: {
          grade: number;
          hours: number;
          plan_id: string;
          school_id?: string | null;
          semester: number;
          subject_id: string;
          workspace_id: string;
        };
        Update: {
          grade?: number;
          hours?: number;
          plan_id?: string;
          school_id?: string | null;
          semester?: number;
          subject_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_hours_plan_id_workspace_id_fkey";
            columns: ["plan_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "curriculum_plans";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "curriculum_hours_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curriculum_hours_subject_id_workspace_id_fkey";
            columns: ["subject_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      curriculum_plans: {
        Row: {
          cohort_year: number;
          id: string;
          school_id: string | null;
          source: string;
          unit: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          cohort_year: number;
          id?: string;
          school_id?: string | null;
          source?: string;
          unit?: string;
          updated_at?: string;
          version?: number;
          workspace_id: string;
        };
        Update: {
          cohort_year?: number;
          id?: string;
          school_id?: string | null;
          source?: string;
          unit?: string;
          updated_at?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "curriculum_plans_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "curriculum_plans_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          target_class_ids?: string[];
          academic_year_id: string;
          activity_area: string;
          created_by: string;
          department: string;
          description: string;
          end_date: string;
          event_type: string;
          id: string;
          school_id: string | null;
          start_date: string;
          target_grades: number[];
          title: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          target_class_ids?: string[];
          academic_year_id: string;
          activity_area?: string;
          created_by?: string;
          department?: string;
          description?: string;
          end_date: string;
          event_type: string;
          id?: string;
          school_id?: string | null;
          start_date: string;
          target_grades?: number[];
          title: string;
          updated_at?: string;
          version?: number;
          workspace_id: string;
        };
        Update: {
          target_class_ids?: string[];
          academic_year_id?: string;
          activity_area?: string;
          created_by?: string;
          department?: string;
          description?: string;
          end_date?: string;
          event_type?: string;
          id?: string;
          school_id?: string | null;
          start_date?: string;
          target_grades?: number[];
          title?: string;
          updated_at?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_academic_year_id_workspace_id_fkey";
            columns: ["academic_year_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          created_by: string;
          email: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          role: string;
          token_hash: string;
          workspace_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          created_by: string;
          email: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          role: string;
          token_hash: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          role?: string;
          token_hash?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          default_workspace_id: string | null;
          display_name: string;
          id: string;
        };
        Insert: {
          default_workspace_id?: string | null;
          display_name?: string;
          id: string;
        };
        Update: {
          default_workspace_id?: string | null;
          display_name?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey";
            columns: ["default_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          id: string;
          region: string;
          school_type: string;
        };
        Insert: {
          id: string;
          region?: string;
          school_type?: string;
        };
        Update: {
          id?: string;
          region?: string;
          school_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schools_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      semesters: {
        Row: {
          academic_year_id: string;
          end_date: string;
          id: string;
          number: number;
          school_id: string | null;
          start_date: string;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          end_date: string;
          id?: string;
          number: number;
          school_id?: string | null;
          start_date: string;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          end_date?: string;
          id?: string;
          number?: number;
          school_id?: string | null;
          start_date?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "semesters_academic_year_id_workspace_id_fkey";
            columns: ["academic_year_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "semesters_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      subject_groups: {
        Row: {
          id: string;
          name: string;
          school_id: string | null;
          workspace_id: string;
        };
        Insert: {
          id?: string;
          name: string;
          school_id?: string | null;
          workspace_id: string;
        };
        Update: {
          id?: string;
          name?: string;
          school_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_groups_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subject_groups_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          curriculum_position?:number|null;
          group_id: string;
          id: string;
          name: string;
          school_id: string | null;
          workspace_id: string;
        };
        Insert: {
          curriculum_position?:number|null;
          group_id: string;
          id?: string;
          name: string;
          school_id?: string | null;
          workspace_id: string;
        };
        Update: {
          curriculum_position?:number|null;
          group_id?: string;
          id?: string;
          name?: string;
          school_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_group_id_workspace_id_fkey";
            columns: ["group_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "subject_groups";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subjects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      teaching_course_editors: {
        Row: { course_id: string; workspace_id: string; user_id: string };
        Insert: { course_id: string; workspace_id: string; user_id: string };
        Update: { course_id?: string; workspace_id?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "teaching_course_editors_course_id_workspace_id_fkey";
            columns: ["course_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "teaching_courses";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "teaching_course_editors_workspace_id_user_id_fkey";
            columns: ["workspace_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workspace_members";
            referencedColumns: ["workspace_id", "user_id"];
          },
        ];
      };
      teaching_course_classes: {
        Row: {
          academic_year_id: string;
          class_id: string;
          course_id: string;
          grade: number;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          class_id: string;
          course_id: string;
          grade: number;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          class_id?: string;
          course_id?: string;
          grade?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_course_classes_class_id_workspace_id_academic_yea_fkey";
            columns: ["class_id", "workspace_id", "academic_year_id", "grade"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: [
              "id",
              "workspace_id",
              "academic_year_id",
              "grade",
            ];
          },
          {
            foreignKeyName: "teaching_course_classes_course_id_workspace_id_academic_ye_fkey";
            columns: ["course_id", "workspace_id", "academic_year_id", "grade"];
            isOneToOne: false;
            referencedRelation: "teaching_courses";
            referencedColumns: [
              "id",
              "workspace_id",
              "academic_year_id",
              "grade",
            ];
          },
        ];
      };
      teaching_courses: {
        Row: {
          academic_year_id: string;
          archived: boolean;
          expected_hours: number | null;
          grade: number;
          id: string;
          manual_hours: number | null;
          owner_id: string | null;
          reference_snapshot: Json;
          semester: number;
          subject_id: string | null;
          subject_name: string;
          teacher_name: string;
          updated_at: string;
          version: number;
          visibility: string;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          archived?: boolean;
          expected_hours?: number | null;
          grade: number;
          id?: string;
          manual_hours?: number | null;
          owner_id?: string | null;
          reference_snapshot: Json;
          semester: number;
          subject_id?: string | null;
          subject_name: string;
          teacher_name: string;
          updated_at?: string;
          version?: number;
          visibility?: string;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          archived?: boolean;
          expected_hours?: number | null;
          grade?: number;
          id?: string;
          manual_hours?: number | null;
          owner_id?: string | null;
          reference_snapshot?: Json;
          semester?: number;
          subject_id?: string | null;
          subject_name?: string;
          teacher_name?: string;
          updated_at?: string;
          version?: number;
          visibility?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_courses_academic_year_id_workspace_id_fkey";
            columns: ["academic_year_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "teaching_courses_subject_id_workspace_id_fkey";
            columns: ["subject_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "teaching_courses_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      teaching_plan_versions: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_name: string;
          course_id: string;
          course_snapshot: Json;
          created_at: string;
          document: Json;
          version: number;
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_name: string;
          course_id: string;
          course_snapshot: Json;
          created_at?: string;
          document: Json;
          version: number;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_name?: string;
          course_id?: string;
          course_snapshot?: Json;
          created_at?: string;
          document?: Json;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_plan_versions_course_id_workspace_id_fkey";
            columns: ["course_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "teaching_courses";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      teaching_plans: {
        Row: {
          academic_year_id: string;
          course_id: string;
          document: Json;
          workspace_id: string;
        };
        Insert: {
          academic_year_id: string;
          course_id: string;
          document: Json;
          workspace_id: string;
        };
        Update: {
          academic_year_id?: string;
          course_id?: string;
          document?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_plans_course_id_workspace_id_academic_year_id_fkey";
            columns: ["course_id", "workspace_id", "academic_year_id"];
            isOneToOne: false;
            referencedRelation: "teaching_courses";
            referencedColumns: ["id", "workspace_id", "academic_year_id"];
          },
        ];
      };
      teaching_standard_links: {
        Row: {
          course_id: string;
          entry_id: string;
          kind: string;
          standard_id: string;
          workspace_id: string;
        };
        Insert: {
          course_id: string;
          entry_id: string;
          kind: string;
          standard_id: string;
          workspace_id: string;
        };
        Update: {
          course_id?: string;
          entry_id?: string;
          kind?: string;
          standard_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teaching_standard_links_course_id_workspace_id_fkey";
            columns: ["course_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "teaching_courses";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "teaching_standard_links_standard_id_workspace_id_fkey";
            columns: ["standard_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "achievement_standards";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      timetable_documents: {
        Row: {
          academic_year_id: string;
          workspace_id: string;
          document: Json;
          version: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "timetable_documents_year_workspace_fk";
            columns: ["workspace_id", "academic_year_id"];
            isOneToOne: true;
            referencedRelation: "academic_years";
            referencedColumns: ["workspace_id", "id"];
          }
        ];
      };
      workspace_members: {
        Row: {
          joined_at: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          joined_at?: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          joined_at?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
          owner_id: string;
          school_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
          owner_id: string;
          school_type?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          owner_id?: string;
          school_type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      reorder_curriculum_subjects_v4:{
        Args:{p_workspace:string;p_group:string;p_order:string[]};Returns:number;
      };
      save_curriculum_operating_v4: {
        Args:{p_workspace:string;p_year:number;p_expected_version:number;p_document:Json;p_action?:string};
        Returns:Json;
      };
      save_curriculum_annual_excel_sheet: {
        Args:{target:string;target_year:number;expected_version:number;next_edits:Json};
        Returns:Json;
      };
      save_curriculum_annual_excel_sheet_v2: {
        Args:{target:string;target_year:number;expected_version:number;next_edits:Json;next_custom_rows:Json};
        Returns:Json;
      };
      curriculum_excel_apply: {
        Args: {target:string;source_year:number;source_kind:string;entries:Json};Returns:Json;
      };
      curriculum_design_acquire: {
        Args:{target_plan:string;take_over?:boolean};Returns:Json;
      };
      curriculum_design_release: {
        Args:{target_plan:string};Returns:void;
      };
      curriculum_design_save: {
        Args:{target_plan:string;expected_plan_version:number;expected_doc_version:number;next_document:Json};Returns:Json;
      };
      curriculum_design_confirm: {
        Args:{target_plan:string};Returns:Json;
      };
      save_timetable_document: {
        Args: { target: string; year_id: string; expected_version: number; next_document: Json };
        Returns: Json;
      };
      save_calendar_changes: {
        Args: { target: string; year_id: string; changes: Json; initial_document: Json; operation?: string };
        Returns: Json;
      };
      accept_invitation: { Args: { token: string }; Returns: string };
      archive_teaching_course: {
        Args: {
          archived_value: boolean;
          expected_version: number;
          target_course: string;
        };
        Returns: number;
      };
      create_curriculum_draft: {
        Args: {
          cohort: number;
          draft_rows: Json;
          draft_source: string;
          draft_unit: string;
          target: string;
        };
        Returns: string;
      };
      create_invitation: {
        Args: { member_role: string; recipient: string; target: string };
        Returns: Json;
      };
      create_school: {
        Args: {
          school_name: string;
          school_region: string;
          school_type?: string;
        };
        Returns: string;
      };
      delete_subject: {
        Args: { expected_plans: Json; target: string; target_subject: string };
        Returns: undefined;
      };
      list_members: {
        Args: { target: string };
        Returns: {
          display_name: string;
          email: string;
          role: string;
          user_id: string;
        }[];
      };
      manage_member: {
        Args: { member_id: string; new_role: string; target: string };
        Returns: undefined;
      };
      refresh_teaching_reference: {
        Args: { expected_version: number; target_course: string };
        Returns: number;
      };
      restore_teaching_plan: {
        Args: {
          expected_version: number;
          revision: number;
          target_course: string;
        };
        Returns: number;
      };
      revoke_invitation: { Args: { invite_id: string }; Returns: undefined };
      save_academic_year: {
        Args: {
          class_counts: number[];
          expected_version: number;
          school_year: number;
          target: string;
          terms: Json;
        };
        Returns: string;
      };
      confirm_academic_calendar: {
        Args: { expected_version: number; target: string; year_id: string };
        Returns: string;
      };
      save_annual_plan: {
        Args: {
          expected_version: number;
          payload: Json;
          target: string;
          year_id: string;
        };
        Returns: number;
      };
      save_curriculum: {
        Args: { entries: Json; expected_version: number; target_plan: string };
        Returns: number;
      };
      save_semesters: {
        Args: {
          expected_version: number;
          target: string;
          terms: Json;
          year_id: string;
        };
        Returns: number;
      };
      save_teaching_course: {
        Args: {
          copy_from?: string;
          expected_version: number;
          settings: Json;
          target: string;
          target_course: string;
        };
        Returns: string;
      };
      set_teaching_plan_editors: {
        Args: { target_course: string; expected_version: number; editors: string[] };
        Returns: number;
      };
      save_teaching_plan: {
        Args: {
          confirm_plan?: boolean;
          expected_version: number;
          payload: Json;
          target_course: string;
        };
        Returns: number;
      };
      set_school_type: {
        Args: { new_school_type: string; target: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
