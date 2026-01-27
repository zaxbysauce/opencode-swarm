import { z } from 'zod';
export declare const AgentOverrideConfigSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    disabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;
export declare const PresetSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    disabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>>;
export type Preset = z.infer<typeof PresetSchema>;
export declare const SwarmModeSchema: z.ZodEnum<{
    remote: "remote";
    hybrid: "hybrid";
}>;
export type SwarmMode = z.infer<typeof SwarmModeSchema>;
export declare const PluginConfigSchema: z.ZodObject<{
    preset: z.ZodOptional<z.ZodString>;
    presets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        disabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>>;
    agents: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        model: z.ZodOptional<z.ZodString>;
        temperature: z.ZodOptional<z.ZodNumber>;
        disabled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    max_iterations: z.ZodDefault<z.ZodNumber>;
    output_dir: z.ZodOptional<z.ZodString>;
    swarm_mode: z.ZodDefault<z.ZodEnum<{
        remote: "remote";
        hybrid: "hybrid";
    }>>;
    gpu_url: z.ZodOptional<z.ZodString>;
    gpu_model: z.ZodOptional<z.ZodString>;
    npu_url: z.ZodOptional<z.ZodString>;
    npu_model: z.ZodOptional<z.ZodString>;
    global_fallback_models: z.ZodOptional<z.ZodArray<z.ZodString>>;
    auto_detect_domains: z.ZodDefault<z.ZodBoolean>;
    inject_phase_reminders: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type { AgentName, SMEAgentName, QAAgentName, PipelineAgentName, } from './constants';
