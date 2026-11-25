export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  summary: string;
  defaultTitle: string;
  brandName: string;
  targetAudience: string;
  platform: 'YouTube' | 'Instagram' | 'TikTok' | 'LinkedIn' | 'Facebook' | 'Web';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  targetDurationSec: number;
  toneOfVoice: string;
  marketingObjective: string;
  thumbnailUrl: string;
  scriptContent: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'product-launch',
    name: 'Product Launch',
    category: 'Campaign Reveal',
    summary: 'High-impact 30s hardware or SaaS launch arc with hook, core differentiator, social proof, and CTA.',
    defaultTitle: 'Flagship Product Launch Film',
    brandName: 'Briqen Acoustics',
    targetAudience: 'Design-focused creators & studio professionals',
    platform: 'YouTube',
    aspectRatio: '16:9',
    targetDurationSec: 30,
    toneOfVoice: 'Confident & Modern',
    marketingObjective: 'Product Launch',
    thumbnailUrl: '/src/assets/images/sample_product_launch_1795602333574.jpg',
    scriptContent: `[SCENE 1 - HOOK | 0:00-0:05]
Visual: Dramatic macro sweep across brushed anodized aluminum in warm studio rim lighting.
Narration: "Most tools force you to choose between speed and craft. Not anymore."

[SCENE 2 - PROBLEM & SHIFT | 0:05-0:12]
Visual: Cluttered desk dissolves cleanly into a minimalist creative workstation bathed in amber key light.
Narration: "Every extra step steals momentum from your best ideas—so we engineered the friction out."

[SCENE 3 - HERO REVEAL | 0:12-0:22]
Visual: Hero product rotates smoothly on a dark slate plinth as crisp UI telemetry highlights precision performance.
Narration: "Meet the next-generation Briqen Studio Edition: built for zero-latency execution and cinema-grade output."

[SCENE 4 - CALL TO ACTION | 0:22-0:30]
Visual: Clean end card with product silhouette, launch date, and subtle amber accent line.
Narration: "Reserve yours today and turn every concept into a finished production in minutes."`,
  },
  {
    id: 'social-teaser',
    name: 'Social Teaser',
    category: 'Short-Form Vertical',
    summary: 'Punchy 15s 9:16 teaser engineered for immediate scroll-stop retention on TikTok and Reels.',
    defaultTitle: '15s Vertical Launch Teaser',
    brandName: 'Briqen Labs',
    targetAudience: 'Mobile-first creators & digital marketers',
    platform: 'TikTok',
    aspectRatio: '9:16',
    targetDurationSec: 15,
    toneOfVoice: 'Energetic & Direct',
    marketingObjective: 'Awareness & Waitlist',
    thumbnailUrl: '/src/assets/images/studio_hero_cinema_1795602333947.jpg',
    scriptContent: `[SCENE 1 - SCROLL STOPPER | 0:00-0:03]
Visual: Rapid vertical whip-pan into a glowing studio timeline monitor with crisp kinetic framing.
Narration: "Stop spending three days editing one 15-second launch clip."

[SCENE 2 - TRANSFORMATION | 0:03-0:10]
Visual: Split-frame vertical sequence showing raw script lines snapping straight into rendered motion scenes.
Narration: "Write your hook, generate every visual frame, and lock your audio mix in a single pass."

[SCENE 3 - TEASE & CTA | 0:10-0:15]
Visual: Bold vertical lockup with early-access prompt and clean studio silhouette.
Narration: "Tap the link below to claim early studio access before Friday."`,
  },
  {
    id: 'explainer-video',
    name: 'Explainer Video',
    category: 'B2B Walkthrough',
    summary: 'Structured 45s narrative breaking down a complex workflow into three clear, measurable steps.',
    defaultTitle: 'Platform Workflow Explainer',
    brandName: 'Briqen Cloud',
    targetAudience: 'Marketing leads, founders & growth teams',
    platform: 'LinkedIn',
    aspectRatio: '16:9',
    targetDurationSec: 45,
    toneOfVoice: 'Clear & Authoritative',
    marketingObjective: 'Pipeline & Demo Signups',
    thumbnailUrl: '/src/assets/images/studio_hero_cinema_1795602333947.jpg',
    scriptContent: `[SCENE 1 - THE CHALLENGE | 0:00-0:10]
Visual: Editorial wide shot of a dispersed marketing team reviewing disconnected spreadsheets and media folders.
Narration: "Scaling video campaigns shouldn't mean juggling five disconnected tools and endless email threads."

[SCENE 2 - STEP 1: BRIEF TO SCRIPT | 0:10-0:20]
Visual: Clean UI view showing a campaign brief transforming into a structured, versioned marketing script.
Narration: "Start in Script Studio: turn any product brief into a timed, team-approved narrative in seconds."

[SCENE 3 - STEP 2: SCENES & MEDIA | 0:20-0:33]
Visual: Dynamic storyboard grid assembling matching scene visuals, voiceover narration, and studio soundtracks.
Narration: "Split your script into scenes automatically, generate cohesive visuals, and refine every transition."

[SCENE 4 - STEP 3: EXPORT & MEASURE | 0:33-0:45]
Visual: Master timeline rendering smoothly into a downloadable MP4 ready for multi-channel launch.
Narration: "Export campaign-ready MP4 drafts in one click. Book a live walkthrough with Briqen Cloud today."`,
  },
  {
    id: 'brand-story',
    name: 'Brand Story',
    category: 'Editorial Film',
    summary: 'Warm 30s founder and craft-focused narrative highlighting purpose, quality, and human impact.',
    defaultTitle: 'Brand Craft & Origin Story',
    brandName: 'Briqen Collective',
    targetAudience: 'Brand loyalists & creative directors',
    platform: 'Web',
    aspectRatio: '16:9',
    targetDurationSec: 30,
    toneOfVoice: 'Warm & Cinematic',
    marketingObjective: 'Brand Affinity',
    thumbnailUrl: '/src/assets/images/sample_brand_story_1795602334394.jpg',
    scriptContent: `[SCENE 1 - ORIGIN | 0:00-0:08]
Visual: Golden hour light streaming across a quiet design studio desk with hand-drawn storyboards and optics.
Narration: "Every memorable brand begins with a simple conviction: details people feel matter most."

[SCENE 2 - CRAFT IN MOTION | 0:08-0:20]
Visual: Close-up documentary shots of creators testing materials, framing shots, and reviewing color grades.
Narration: "Behind every frame is a team obsessed with clarity, rhythm, and storytelling that respects your audience."

[SCENE 3 - THE PROMISE | 0:20-0:30]
Visual: Expansive wide portrait of the studio team smiling as the finished reel illuminates the room.
Narration: "Crafted for creators who build things that last. Welcome to Briqen Collective."`,
  },
];
