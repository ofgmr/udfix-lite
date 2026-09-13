import React from 'react';
import { ZipViewer } from './ZipViewer';

interface EypViewerProps {
    fileUrl: string;
}

export const EypViewer: React.FC<EypViewerProps> = ({ fileUrl }) => {
    return <ZipViewer fileUrl={fileUrl} variant="eyp" />;
};
