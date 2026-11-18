import Hub from '@/components/hub';
export function generateStaticParams() { return ['news','audio','games','music','calendar','library','work','settings','hobbies','watch','football'].map(section => ({section})); }
export default async function Page({ params }: {params: Promise<{section: string}>}) { const {section} = await params; return <Hub section={section}/>; }
